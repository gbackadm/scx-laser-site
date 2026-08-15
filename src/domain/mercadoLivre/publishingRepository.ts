import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabasePool } from "@/domain/catalog/db";
import {
  buildPenUserProductPayloads,
  classifyMercadoLivreValidation,
  publishingInputHash,
  validatePenSource,
  type PenPublishingSource,
} from "@/domain/mercadoLivre/publishingCore.js";
import {
  createMercadoLivreDescription,
  createMercadoLivreItem,
  mercadoLivreRequest,
  validateMercadoLivreItem,
} from "@/domain/mercadoLivre/client";

export type MercadoLivreDraftPayload = {
  variantId: string;
  sku: string;
  color: string;
  body: Record<string, unknown>;
};

export type MercadoLivreDraft = {
  productId: string;
  categoryId: string;
  domainId: string;
  familyName: string;
  description: string;
  status: string;
  payloads: MercadoLivreDraftPayload[];
  validationResults: unknown[];
  errorMessage: string | null;
  updatedAt: string;
};

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function listMercadoLivreCandidates() {
  const result = await getDatabasePool().query(
    `SELECT p.id, p.scx_sku, p.title, category.name AS category,
            count(DISTINCT variant.id)::int AS variant_count,
            count(DISTINCT mapping.id)::int AS published_variants,
            draft.status AS draft_status
       FROM scx_catalog_products p
       INNER JOIN scx_catalog_categories category ON category.id = p.category_id
       LEFT JOIN scx_catalog_product_variants variant
         ON variant.product_id = p.id AND variant.is_active = true
       LEFT JOIN scx_catalog_product_variant_channel_mappings mapping
         ON mapping.variant_id = variant.id AND mapping.channel = 'mercado_livre'
       LEFT JOIN scx_mercado_livre_product_drafts draft ON draft.product_id = p.id
      WHERE category.name = 'Canetas'
      GROUP BY p.id, category.name, draft.status
      ORDER BY p.updated_at DESC, p.title
      LIMIT 30`,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    scxSku: String(row.scx_sku),
    title: String(row.title),
    category: String(row.category),
    variantCount: Number(row.variant_count),
    publishedVariants: Number(row.published_variants),
    draftStatus: row.draft_status ? String(row.draft_status) : null,
  }));
}

async function getPenSource(productId: string) {
  const pool = getDatabasePool();
  const [productResult, variantResult, imageResult] = await Promise.all([
    pool.query(
      `SELECT p.id, p.sku, p.scx_sku, p.title, p.price_amount_in_cents,
              p.stock_quantity, category.name AS category, sp.external_id,
              sp.raw_payload
         FROM scx_catalog_products p
         INNER JOIN scx_catalog_categories category ON category.id = p.category_id
         LEFT JOIN scx_catalog_supplier_products sp ON sp.id = p.supplier_product_id
        WHERE p.id = $1 LIMIT 1`,
      [productId],
    ),
    pool.query(
      `SELECT variant.id, variant.scx_sku, variant.price_amount_in_cents,
              variant.stock_quantity, variant.attributes,
              COALESCE(array_agg(image.url ORDER BY image.sort_order, image.id)
                FILTER (WHERE image.id IS NOT NULL), '{}'::text[]) AS images
         FROM scx_catalog_product_variants variant
         LEFT JOIN scx_catalog_product_variant_images image ON image.variant_id = variant.id
        WHERE variant.product_id = $1 AND variant.is_active = true
        GROUP BY variant.id
        ORDER BY variant.sort_order, variant.id`,
      [productId],
    ),
    pool.query(
      `SELECT url FROM scx_catalog_product_images WHERE product_id = $1
        AND btrim(url) <> '' ORDER BY sort_order, id`,
      [productId],
    ),
  ]);
  const product = productResult.rows[0];
  if (!product) throw new Error("Produto nao encontrado.");
  if (product.category !== "Canetas") {
    throw new Error("O MVP publica somente a categoria Canetas.");
  }
  const source: PenPublishingSource = {
    supplierCode: String(product.external_id ?? product.sku),
    images: imageResult.rows.map((row) => String(row.url)),
    variants: variantResult.rows.map((row) => ({
      id: String(row.id),
      scxSku: String(row.scx_sku),
      priceInCents: Number(row.price_amount_in_cents),
      stockQuantity: Number(row.stock_quantity),
      attributes: row.attributes ?? {},
      images: (row.images ?? []).map(String),
    })),
  };
  return { source, product };
}

export async function generateMercadoLivreDraft(productId: string, actorUserId: string) {
  const { source, product } = await getPenSource(productId);
  const errors = validatePenSource(source);
  if (errors.length) throw new Error(errors.join(" "));
  const generated = buildPenUserProductPayloads(source);
  const inputHash = publishingInputHash({ source, rawPayload: product.raw_payload });
  await getDatabasePool().query(
    `INSERT INTO scx_mercado_livre_product_drafts (
       id, product_id, category_id, domain_id, family_name, description,
       content_source, input_hash, payloads, status, created_by
     ) VALUES ($1,$2,'MLB44014','MLB-PENS',$3,$4,'rules',$5,$6::jsonb,'draft',$7)
     ON CONFLICT (product_id) DO UPDATE SET
       category_id = EXCLUDED.category_id,
       domain_id = EXCLUDED.domain_id,
       family_name = EXCLUDED.family_name,
       description = EXCLUDED.description,
       input_hash = EXCLUDED.input_hash,
       payloads = EXCLUDED.payloads,
       validation_results = '[]'::jsonb,
       status = 'draft',
       error_message = NULL,
       created_by = EXCLUDED.created_by,
       updated_at = now()`,
    [randomUUID(), productId, generated.familyName, generated.description, inputHash, JSON.stringify(generated.payloads), actorUserId],
  );
  return getMercadoLivreDraft(productId);
}

export async function getMercadoLivreDraft(productId: string) {
  const result = await getDatabasePool().query(
    `SELECT * FROM scx_mercado_livre_product_drafts WHERE product_id = $1 LIMIT 1`,
    [productId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    productId: String(row.product_id),
    categoryId: String(row.category_id),
    domainId: String(row.domain_id),
    familyName: String(row.family_name),
    description: String(row.description),
    status: String(row.status),
    payloads: row.payloads ?? [],
    validationResults: row.validation_results ?? [],
    errorMessage: row.error_message ? String(row.error_message) : null,
    updatedAt: iso(row.updated_at),
  } satisfies MercadoLivreDraft;
}

export async function validateMercadoLivreDraft(productId: string) {
  const draft = await getMercadoLivreDraft(productId);
  if (!draft) throw new Error("Gere o rascunho antes de validar.");
  const results = [];
  for (const payload of draft.payloads) {
    const response = await validateMercadoLivreItem(payload.body);
    const validation = classifyMercadoLivreValidation(response.ok, response.body);
    results.push({
      sku: payload.sku,
      ok: validation.accepted,
      status: response.status,
      warnings: validation.warnings,
      errors: validation.errors,
      response: response.body,
    });
  }
  const failed = results.filter((result) => !result.ok);
  await getDatabasePool().query(
    `UPDATE scx_mercado_livre_product_drafts SET
       validation_results = $2::jsonb,
       status = $3,
       error_message = $4,
       validated_at = CASE WHEN $3 = 'validated' THEN now() ELSE validated_at END,
       updated_at = now()
     WHERE product_id = $1`,
    [productId, JSON.stringify(results), failed.length ? "error" : "validated", failed.length ? `${failed.length} variacao(oes) rejeitada(s) pelo validador.` : null],
  );
  return getMercadoLivreDraft(productId);
}

export async function publishMercadoLivreDraft(productId: string) {
  const draft = await getMercadoLivreDraft(productId);
  if (!draft || draft.status !== "validated") {
    throw new Error("O rascunho precisa passar pelo validador antes da publicacao.");
  }
  const pool = getDatabasePool();
  const claimed = await pool.query(
    `UPDATE scx_mercado_livre_product_drafts
        SET status = 'publishing', error_message = NULL, updated_at = now()
      WHERE product_id = $1 AND status = 'validated'
      RETURNING product_id`,
    [productId],
  );
  if (!claimed.rowCount) throw new Error("Este produto ja esta sendo publicado.");
  const published = [];
  try {
    for (const payload of draft.payloads) {
      const existing = await pool.query(
        `SELECT external_id, raw_response FROM scx_catalog_product_variant_channel_mappings
          WHERE variant_id = $1 AND channel = 'mercado_livre' LIMIT 1`,
        [payload.variantId],
      );
      if (existing.rows[0]) {
        const saved = existing.rows[0].raw_response ?? {};
        let description = saved.description;
        if (!description?.ok) {
          const retried = await createMercadoLivreDescription(existing.rows[0].external_id, draft.description);
          description = { ok: retried.ok, status: retried.status, body: retried.body };
          await pool.query(
            `UPDATE scx_catalog_product_variant_channel_mappings
                SET sync_status=$2, last_synced_at=now(), raw_response=$3::jsonb, updated_at=now()
              WHERE variant_id=$1 AND channel='mercado_livre'`,
            [payload.variantId, retried.ok ? "synced" : "failed", JSON.stringify({ ...saved, description })],
          );
          if (!retried.ok) throw new Error(`${payload.sku}: anuncio criado, mas a descricao foi recusada (${retried.status}).`);
        }
        published.push({ sku: payload.sku, itemId: existing.rows[0].external_id, skipped: true, response: saved.item ?? saved });
        continue;
      }
      const created = await createMercadoLivreItem(payload.body);
      if (!created.ok || !created.body?.id) {
        throw new Error(`${payload.sku}: Mercado Livre recusou a publicacao (${created.status}). ${JSON.stringify(created.body)}`);
      }
      await pool.query(
        `INSERT INTO scx_catalog_product_variant_channel_mappings (
           id, variant_id, channel, external_id, external_sku, sync_status,
           last_synced_at, raw_response
         ) VALUES ($1,$2,'mercado_livre',$3,$4,'pending',now(),$5::jsonb)`,
        [randomUUID(), payload.variantId, created.body.id, payload.sku, JSON.stringify({ item: created.body })],
      );
      const description = await createMercadoLivreDescription(created.body.id, draft.description);
      await pool.query(
        `UPDATE scx_catalog_product_variant_channel_mappings
            SET sync_status=$2, last_synced_at=now(), raw_response=$3::jsonb, updated_at=now()
          WHERE variant_id=$1 AND channel='mercado_livre'`,
        [payload.variantId, description.ok ? "synced" : "failed", JSON.stringify({ item: created.body, description: { ok: description.ok, status: description.status, body: description.body } })],
      );
      if (!description.ok) throw new Error(`${payload.sku}: anuncio criado, mas a descricao foi recusada (${description.status}).`);
      published.push({ sku: payload.sku, itemId: created.body.id, skipped: false, response: created.body });
    }
    const firstUserProductId = published.find((item) => item.response?.user_product_id)?.response?.user_product_id;
    let familyId = null;
    if (firstUserProductId) {
      const userProduct = await mercadoLivreRequest<{ family_id?: string | number }>(`/user-products/${firstUserProductId}`);
      familyId = userProduct.ok ? userProduct.body?.family_id ?? null : null;
    }
    await pool.query(
      `INSERT INTO scx_catalog_product_channel_mappings (
         id, product_id, channel, external_id, external_sku, sync_status,
         last_synced_at, raw_response
       ) VALUES ($1,$2,'mercado_livre',$3,(SELECT scx_sku FROM scx_catalog_products WHERE id=$2),'synced',now(),$4::jsonb)
       ON CONFLICT (product_id, channel) DO UPDATE SET
         external_id = EXCLUDED.external_id, sync_status = 'synced',
         last_synced_at = now(), raw_response = EXCLUDED.raw_response, updated_at = now()`,
      [randomUUID(), productId, String(familyId ?? firstUserProductId ?? published[0]?.itemId), JSON.stringify({ familyId, items: published })],
    );
    await pool.query(
      `UPDATE scx_mercado_livre_product_drafts SET status='published', published_at=now(), updated_at=now() WHERE product_id=$1`,
      [productId],
    );
    return { draft: await getMercadoLivreDraft(productId), published };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao publicar no Mercado Livre.";
    await pool.query(
      `UPDATE scx_mercado_livre_product_drafts SET status='error', error_message=$2, updated_at=now() WHERE product_id=$1`,
      [productId, message],
    );
    throw error;
  }
}
