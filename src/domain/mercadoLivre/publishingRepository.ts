import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabasePool } from "@/domain/catalog/db";
import {
  buildGenericUserProductPayloads,
  deriveProfilePacks,
  type AttributeMapping,
  type PublishingProfile,
} from "@/domain/mercadoLivre/genericPublishingCore.js";
import {
  buildPenUserProductPayloads,
  classifyOfferFinancials,
  classifyMercadoLivreValidation,
  derivePackOptions,
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
import { getMercadoLivreConnection } from "@/domain/mercadoLivre/repository";
import {
  calculatePrice,
  getGlobalPricingRule,
  listGlobalPricingBatchTiers,
} from "@/domain/pricing/rules";

export type MercadoLivreDraftPayload = {
  offerId: string;
  variantId: string;
  sku: string;
  color: string;
  unitsPerPack: number;
  unitPriceInCents: number;
  productCostInCents: number;
  description: string;
  readinessErrors?: string[];
  publishable: boolean;
  financialStatus: "healthy" | "warning" | "blocked";
  fees?: {
    saleFeeInCents: number;
    shippingCostInCents: number;
    netRevenueInCents: number;
    contributionInCents: number;
    contributionPercentage: number;
    operationalCostInCents: number;
    taxReserveInCents: number;
    estimatedProfitInCents: number;
    returnPercentage: number;
    blockReasons: string[];
  };
  package: {
    unitsPerPack: number;
    heightCm: number;
    widthCm: number;
    lengthCm: number;
    weightGrams: number;
    confidence: "confirmed" | "estimated";
    warning: string | null;
  };
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

function localeNumber(value: unknown) {
  const match = String(value ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function confirmedMasterPack(rawPayload: Record<string, unknown> | null | undefined) {
  const properties = (rawPayload?.propriedades ?? {}) as Record<string, unknown>;
  const masterUnits = Math.round(localeNumber(properties["quant-por-caixa"]));
  const innerUnits = Math.round(localeNumber(properties["quant-por-caixinha"]));
  const dimensions = String(properties["dimensao-caixa"] ?? "")
    .replace(/,/g, ".")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number) ?? [];
  const weightKg = localeNumber(properties["peso-da-caixa"] ?? properties["peso-caixa"]);
  return {
    masterUnits,
    innerUnits,
    lengthCm: dimensions[0] ?? 0,
    widthCm: dimensions[1] ?? 0,
    heightCm: dimensions[2] ?? 0,
    weightGrams: Math.round(weightKg * 1000),
  };
}

function confirmedUnitPack(rawPayload: Record<string, unknown> | null | undefined) {
  const properties = (rawPayload?.propriedades ?? {}) as Record<string, unknown>;
  const dimensions = String(properties["dimensao-produto"] ?? "")
    .replace(/,/g, ".")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number) ?? [];
  const rawHeight = localeNumber(rawPayload?.altura);
  const rawWidth = localeNumber(rawPayload?.largura);
  const rawLength = localeNumber(rawPayload?.comprimento);
  const heightCm = dimensions.length >= 2 ? dimensions[0] : rawHeight;
  const widthCm = dimensions.length >= 3 ? dimensions[1] : dimensions[1] ?? rawWidth;
  const lengthCm = dimensions.length >= 3 ? dimensions[2] : dimensions[1] ?? rawLength;
  const weightKg = localeNumber(properties["peso-do-produto"] ?? rawPayload?.peso);
  return { heightCm, widthCm, lengthCm, weightGrams: Math.round(weightKg * 1000) };
}

export async function listMercadoLivreCandidates() {
  const result = await getDatabasePool().query(
    `SELECT p.id, p.scx_sku, p.title, category.name AS category,
            COALESCE(
              (SELECT image.url FROM scx_catalog_product_images image WHERE image.product_id=p.id AND btrim(image.url) <> '' ORDER BY image.sort_order, image.id LIMIT 1),
              (SELECT image.url FROM scx_catalog_product_variant_images image
                INNER JOIN scx_catalog_product_variants image_variant ON image_variant.id=image.variant_id
                WHERE image_variant.product_id=p.id AND image_variant.is_active=true AND btrim(image.url) <> ''
                ORDER BY image_variant.sort_order, image.sort_order, image.id LIMIT 1)
            ) AS image_url,
            count(DISTINCT variant.id)::int AS variant_count,
            count(DISTINCT offer.id) FILTER (WHERE offer.external_id IS NOT NULL)::int AS published_variants,
            draft.status AS draft_status,
            profile.status AS profile_status,
            profile.category_id AS mercado_livre_category_id
       FROM scx_catalog_products p
       INNER JOIN scx_catalog_categories category ON category.id = p.category_id
       LEFT JOIN scx_catalog_product_variants variant
         ON variant.product_id = p.id AND variant.is_active = true
       LEFT JOIN scx_catalog_marketplace_offers offer
         ON offer.variant_id = variant.id AND offer.channel = 'mercado_livre'
       LEFT JOIN scx_mercado_livre_product_drafts draft ON draft.product_id = p.id
       LEFT JOIN scx_mercado_livre_category_profiles profile ON profile.catalog_category_id = p.category_id
      GROUP BY p.id, category.name, draft.status, profile.status, profile.category_id
      ORDER BY CASE WHEN profile.status = 'reviewed' THEN 0 ELSE 1 END, category.name, p.title
      LIMIT 200`,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    scxSku: String(row.scx_sku),
    title: String(row.title),
    category: String(row.category),
    imageUrl: row.image_url ? String(row.image_url) : null,
    variantCount: Number(row.variant_count),
    publishedVariants: Number(row.published_variants),
    draftStatus: row.draft_status ? String(row.draft_status) : null,
    profileStatus: row.profile_status ? String(row.profile_status) : "unreviewed",
    mercadoLivreCategoryId: row.mercado_livre_category_id ? String(row.mercado_livre_category_id) : null,
  }));
}

async function getPublishingData(productId: string) {
  const pool = getDatabasePool();
  const [productResult, variantResult, imageResult, pricingRule, pricingTiers, profileResult] = await Promise.all([
    pool.query(
      `SELECT p.id, p.sku, p.scx_sku, p.title, p.description, p.category_id, p.price_amount_in_cents,
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
              variant.cost_amount_in_cents,
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
    getGlobalPricingRule(),
    listGlobalPricingBatchTiers(),
    pool.query(`SELECT * FROM scx_mercado_livre_category_profiles profile
      WHERE profile.catalog_category_id = (SELECT category_id FROM scx_catalog_products WHERE id = $1)
      LIMIT 1`, [productId]),
  ]);
  const product = productResult.rows[0];
  if (!product) throw new Error("Produto nao encontrado.");
  const profile = profileResult.rows[0];
  if (!profile || profile.status !== "reviewed") throw new Error(`Categoria ${product.category} ainda nao possui perfil Mercado Livre revisado.`);
  const master = confirmedMasterPack(product.raw_payload);
  const desiredQuantities = [...new Set([...(profile.pack_quantities ?? []).map(Number), master.masterUnits].filter((value) => value > 0))];
  const genericPacks = deriveProfilePacks({
    desiredQuantities,
    masterPack: { unitsPerPack: master.masterUnits, heightCm: master.heightCm, widthCm: master.widthCm, lengthCm: master.lengthCm, weightGrams: master.weightGrams },
    unit: confirmedUnitPack(product.raw_payload),
  });
  const packs = profile.adapter === "pens" ? derivePackOptions(master) : genericPacks.packs.map((pack) => ({ ...pack, warning: pack.warning ?? null }));
  if (!packs.length) throw new Error(genericPacks.errors.map((item) => item.message).join(" ") || "Produto sem embalagem comercial utilizavel.");
  const variants = variantResult.rows.map((row) => ({
      id: String(row.id),
      scxSku: String(row.scx_sku),
      sku: String(row.scx_sku),
      offerPricesInCents: Object.fromEntries(packs.map((pack) => {
        const tier = [...pricingTiers]
          .filter((item) => item.minQuantity <= pack.unitsPerPack)
          .sort((a, b) => b.minQuantity - a.minQuantity)[0];
        return [String(pack.unitsPerPack), calculatePrice({
          costAmountInCents: Number(row.cost_amount_in_cents),
          quantity: pack.unitsPerPack,
          rule: pricingRule,
          tier,
        }).roundedAmountInCents];
      })),
      costInCents: Number(row.cost_amount_in_cents),
      stockQuantity: Number(row.stock_quantity),
      attributes: row.attributes ?? {},
      images: (row.images ?? []).map(String),
    }));
  const images = imageResult.rows.map((row) => String(row.url));
  return { product, profile, packs, variants, images, pricingRule, genericPackErrors: genericPacks.errors };
}

export async function generateMercadoLivreDraft(productId: string, actorUserId: string) {
  const { product, profile, packs, variants, images, pricingRule, genericPackErrors } = await getPublishingData(productId);
  const connection = await getMercadoLivreConnection();
  if (!connection) throw new Error("Conecte a conta do Mercado Livre antes de gerar a previa.");
  let generated: { familyName: string; description: string; payloads: MercadoLivreDraftPayload[] };
  let source: PenPublishingSource | Record<string, unknown>;
  if (profile.adapter === "pens") {
    const penSource: PenPublishingSource = { supplierCode: String(product.external_id ?? product.sku), images, packs, variants };
    source = penSource;
    const errors = validatePenSource(penSource);
    if (errors.length) throw new Error(errors.join(" "));
    generated = buildPenUserProductPayloads(penSource);
  } else {
    const [categoryResponse, categoryDetailsResponse] = await Promise.all([
      mercadoLivreRequest<Array<{ id: string; tags?: Record<string, boolean> }>>(`/categories/${profile.category_id}/attributes`),
      mercadoLivreRequest<{ settings?: { max_pictures_per_item?: number } }>(`/categories/${profile.category_id}`),
    ]);
    if (!categoryResponse.ok || !Array.isArray(categoryResponse.body) || !categoryDetailsResponse.ok) {
      throw new Error("Nao foi possivel consultar as regras atuais da categoria Mercado Livre.");
    }
    const normalizedProduct = {
      id: String(product.id),
      title: String(product.title),
      description: String(product.description ?? ""),
      supplierCode: String(product.external_id ?? product.sku),
      sku: String(product.scx_sku),
      stockQuantity: Number(product.stock_quantity),
      images,
      offerPricesInCents: {},
      variants: variants.map((variant) => ({ ...variant, offerPricesInCents: variant.offerPricesInCents })),
    };
    const normalizedProfile: PublishingProfile = {
      status: profile.status,
      categoryId: profile.category_id,
      domainId: profile.domain_id,
      familyName: String(product.title),
      maxPictures: Number(categoryDetailsResponse.body?.settings?.max_pictures_per_item ?? 12),
      variationAxes: profile.variation_axes ?? [],
      packQuantities: packs.map((pack) => pack.unitsPerPack),
      attributeMappings: (profile.attribute_mapping ?? []) as AttributeMapping[],
    };
    const generic = buildGenericUserProductPayloads({ product: normalizedProduct, profile: normalizedProfile, categoryAttributes: categoryResponse.body, packages: packs });
    const byVariant = new Map(variants.map((variant) => [variant.id, variant]));
    generated = {
      familyName: String(product.title),
      description: String(product.description ?? ""),
      payloads: generic.payloads.map((payload) => {
        const variant = byVariant.get(payload.variantId)!;
        const priceInCents = variant.offerPricesInCents[String(payload.unitsPerPack)];
        return {
          ...payload,
          package: { ...payload.package, warning: payload.package.warning ?? null },
          color: payload.variationIdentity,
          unitPriceInCents: Math.round(priceInCents / payload.unitsPerPack),
          productCostInCents: variant.costInCents * payload.unitsPerPack,
          description: `Kit com ${payload.unitsPerPack} unidade(s).\n\n${String(product.description ?? "")}`,
          financialStatus: payload.publishable ? "healthy" as const : "blocked" as const,
          readinessErrors: [...payload.errors.map((item) => item.message), ...genericPackErrors.map((item) => item.message)],
        };
      }),
    };
    source = { normalizedProduct, normalizedProfile, packs };
  }
  const costCache = new Map<string, Promise<{ saleFeeInCents: number; shippingCostInCents: number }>>();
  for (const payload of generated.payloads) {
      const body = payload.body as { price: number; listing_type_id: string; category_id: string };
      const pack = payload.package;
      const dimensions = `${Math.ceil(pack.heightCm)}x${Math.ceil(pack.widthCm)}x${Math.ceil(pack.lengthCm)},${Math.ceil(pack.weightGrams)}`;
      const costKey = `${body.category_id}:${body.listing_type_id}:${body.price}:${dimensions}`;
      if (!costCache.has(costKey)) {
        costCache.set(costKey, (async () => {
          const feeQuery = new URLSearchParams({ price: String(body.price), listing_type_id: body.listing_type_id, category_id: body.category_id, currency_id: "BRL", logistic_type: "drop_off" });
          const shippingQuery = new URLSearchParams({ dimensions, verbose: "true", item_price: String(body.price), listing_type_id: body.listing_type_id, mode: "me2", condition: "new", logistic_type: "drop_off", free_shipping: "true" });
          const [feeResponse, shippingResponse] = await Promise.all([
            mercadoLivreRequest<{ sale_fee_amount?: number }>(`/sites/${connection.siteId}/listing_prices?${feeQuery}`),
            mercadoLivreRequest<{ coverage?: { all_country?: { list_cost?: number } } }>(`/users/${connection.userId}/shipping_options/free?${shippingQuery}`),
          ]);
          if (!feeResponse.ok || !shippingResponse.ok) throw new Error(`Nao foi possivel calcular custos do kit ${pack.unitsPerPack}.`);
          return {
            saleFeeInCents: Math.round(Number(feeResponse.body?.sale_fee_amount ?? 0) * 100),
            shippingCostInCents: Math.round(Number(shippingResponse.body?.coverage?.all_country?.list_cost ?? 0) * 100),
          };
        })());
      }
      const { saleFeeInCents, shippingCostInCents } = await costCache.get(costKey)!;
      const priceInCents = Math.round(Number(body.price) * 100);
      const financials = classifyOfferFinancials({
        priceInCents,
        saleFeeInCents,
        shippingCostInCents,
        productCostInCents: payload.productCostInCents,
        operationalCostInCents: pricingRule.marketplaceOperationalCostAmountInCents,
        taxReservePercentage: pricingRule.marketplaceTaxReservePercentage,
        minProfitInCents: pricingRule.marketplaceMinProfitAmountInCents,
        minReturnPercentage: pricingRule.marketplaceMinReturnPercentage,
        maxProductCostInCents: pricingRule.marketplaceMaxProductCostAmountInCents,
      });
      if (payload.package.confidence !== "confirmed") {
        financials.blockReasons.push("Embalagem estimada: confirme medidas e peso antes de publicar.");
        financials.publishable = false;
        financials.financialStatus = "blocked";
      }
      for (const readinessError of payload.readinessErrors ?? []) {
        if (!financials.blockReasons.includes(readinessError)) financials.blockReasons.push(readinessError);
      }
      if (financials.blockReasons.length) {
        financials.publishable = false;
        financials.financialStatus = "blocked";
      }
      payload.fees = financials;
      payload.publishable = financials.publishable;
      payload.financialStatus = financials.financialStatus;
  }
  const inputHash = publishingInputHash({ source, rawPayload: product.raw_payload });
  await Promise.all(generated.payloads.map((payload) => getDatabasePool().query(
    `INSERT INTO scx_catalog_marketplace_offers (
       id, product_id, variant_id, channel, units_per_pack,
       package_height_cm, package_width_cm, package_length_cm,
       package_weight_grams, package_confidence, package_warning, external_sku
     ) VALUES ($1,$2,$3,'mercado_livre',$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (variant_id, channel, units_per_pack) DO UPDATE SET
       package_height_cm=EXCLUDED.package_height_cm,
       package_width_cm=EXCLUDED.package_width_cm,
       package_length_cm=EXCLUDED.package_length_cm,
       package_weight_grams=EXCLUDED.package_weight_grams,
       package_confidence=EXCLUDED.package_confidence,
       package_warning=EXCLUDED.package_warning,
       external_sku=EXCLUDED.external_sku,
       updated_at=now()`,
    [payload.offerId, productId, payload.variantId, payload.unitsPerPack,
      payload.package.heightCm, payload.package.widthCm, payload.package.lengthCm,
      payload.package.weightGrams, payload.package.confidence, payload.package.warning, payload.sku],
  )));
  await getDatabasePool().query(
    `INSERT INTO scx_mercado_livre_product_drafts (
       id, product_id, category_id, domain_id, family_name, description,
       content_source, input_hash, payloads, status, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,'rules',$7,$8::jsonb,'draft',$9)
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
    [randomUUID(), productId, profile.category_id, profile.domain_id, generated.familyName, generated.description, inputHash, JSON.stringify(generated.payloads), actorUserId],
  );
  return getMercadoLivreDraft(productId);
}

export async function getMercadoLivreDraft(productId: string): Promise<MercadoLivreDraft | null> {
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

async function assertMercadoLivreDraftFresh(draft: MercadoLivreDraft) {
  const result = await getDatabasePool().query(
    `SELECT GREATEST(
       product.updated_at,
       COALESCE(supplier.updated_at, product.updated_at),
       COALESCE(profile.updated_at, product.updated_at),
       COALESCE(pricing.updated_at, product.updated_at),
       COALESCE(MAX(variant.updated_at), product.updated_at)
     ) AS source_updated_at
     FROM scx_catalog_products product
     LEFT JOIN scx_catalog_supplier_products supplier ON supplier.id = product.supplier_product_id
     LEFT JOIN scx_catalog_product_variants variant ON variant.product_id = product.id
     LEFT JOIN scx_mercado_livre_category_profiles profile ON profile.catalog_category_id = product.category_id
     LEFT JOIN scx_catalog_pricing_rules pricing ON pricing.scope = 'global' AND pricing.is_active = true
     WHERE product.id = $1
     GROUP BY product.updated_at, supplier.updated_at, profile.updated_at, pricing.updated_at`,
    [draft.productId],
  );
  const sourceUpdatedAt = result.rows[0]?.source_updated_at ? new Date(result.rows[0].source_updated_at) : null;
  if (sourceUpdatedAt && sourceUpdatedAt > new Date(draft.updatedAt)) {
    throw new Error("Produto, estoque, perfil ou precificacao mudou depois da previa. Gere e valide novamente.");
  }
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

export async function publishMercadoLivreDraft(productId: string, unitsPerPack: number) {
  const draft = await getMercadoLivreDraft(productId);
  if (!draft || draft.status !== "validated") {
    throw new Error("O rascunho precisa passar pelo validador antes da publicacao.");
  }
  await assertMercadoLivreDraftFresh(draft);
  const selectedPayloads = draft.payloads.filter((payload) => payload.unitsPerPack === unitsPerPack);
  if (!selectedPayloads.length) throw new Error("A familia de kit selecionada nao existe nesta previa.");
  if (selectedPayloads.some((payload: MercadoLivreDraftPayload) => !payload.fees || !Array.isArray(payload.fees.blockReasons))) {
    throw new Error("A previa financeira esta desatualizada. Gere e valide uma nova previa antes de publicar.");
  }
  if (selectedPayloads.some((payload: MercadoLivreDraftPayload) => !payload.publishable)) {
    throw new Error("A familia selecionada possui bloqueios comerciais ou logisticos.");
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
    for (const payload of selectedPayloads) {
      const existing = await pool.query(
        `SELECT external_id, raw_response FROM scx_catalog_marketplace_offers
          WHERE id = $1 AND channel = 'mercado_livre' LIMIT 1`,
        [payload.offerId],
      );
      if (existing.rows[0]?.external_id) {
        const saved = existing.rows[0].raw_response ?? {};
        let description = saved.description;
        if (!description?.ok) {
          const retried = await createMercadoLivreDescription(existing.rows[0].external_id, payload.description);
          description = { ok: retried.ok, status: retried.status, body: retried.body };
          await pool.query(
            `UPDATE scx_catalog_marketplace_offers
                SET sync_status=$2, last_synced_at=now(), raw_response=$3::jsonb, updated_at=now()
              WHERE id=$1 AND channel='mercado_livre'`,
            [payload.offerId, retried.ok ? "synced" : "failed", JSON.stringify({ ...saved, description })],
          );
          if (!retried.ok) throw new Error(`${payload.sku}: anuncio criado, mas a descricao foi recusada (${retried.status}).`);
        }
        published.push({ sku: payload.sku, unitsPerPack: payload.unitsPerPack, itemId: existing.rows[0].external_id, skipped: true, response: saved.item ?? saved });
        continue;
      }
      const created = await createMercadoLivreItem(payload.body);
      if (!created.ok || !created.body?.id) {
        throw new Error(`${payload.sku}: Mercado Livre recusou a publicacao (${created.status}). ${JSON.stringify(created.body)}`);
      }
      await pool.query(
        `UPDATE scx_catalog_marketplace_offers SET external_id=$2, sync_status='pending',
           last_synced_at=now(), raw_response=$3::jsonb, updated_at=now()
         WHERE id=$1`,
        [payload.offerId, created.body.id, JSON.stringify({ item: created.body })],
      );
      const description = await createMercadoLivreDescription(created.body.id, payload.description);
      await pool.query(
        `UPDATE scx_catalog_marketplace_offers
            SET sync_status=$2, last_synced_at=now(), raw_response=$3::jsonb, updated_at=now()
          WHERE id=$1 AND channel='mercado_livre'`,
        [payload.offerId, description.ok ? "synced" : "failed", JSON.stringify({ item: created.body, description: { ok: description.ok, status: description.status, body: description.body } })],
      );
      if (!description.ok) throw new Error(`${payload.sku}: anuncio criado, mas a descricao foi recusada (${description.status}).`);
      published.push({ sku: payload.sku, unitsPerPack: payload.unitsPerPack, itemId: created.body.id, skipped: false, response: created.body });
    }
    const families = [];
    for (const unitsPerPack of [...new Set(published.map((item) => item.unitsPerPack))]) {
      const userProductId = published.find((item) => item.unitsPerPack === unitsPerPack && item.response?.user_product_id)?.response?.user_product_id;
      if (!userProductId) continue;
      const userProduct = await mercadoLivreRequest<{ family_id?: string | number }>(`/user-products/${userProductId}`);
      families.push({ unitsPerPack, userProductId, familyId: userProduct.ok ? userProduct.body?.family_id ?? null : null });
    }
    const firstFamily = families[0];
    await pool.query(
      `INSERT INTO scx_catalog_product_channel_mappings (
         id, product_id, channel, external_id, external_sku, sync_status,
         last_synced_at, raw_response
       ) VALUES ($1,$2,'mercado_livre',$3,(SELECT scx_sku FROM scx_catalog_products WHERE id=$2),'synced',now(),$4::jsonb)
       ON CONFLICT (product_id, channel) DO UPDATE SET
         external_id = EXCLUDED.external_id, sync_status = 'synced',
         last_synced_at = now(), raw_response = EXCLUDED.raw_response, updated_at = now()`,
      [randomUUID(), productId, String(firstFamily?.familyId ?? firstFamily?.userProductId ?? published[0]?.itemId), JSON.stringify({ families, items: published })],
    );
    const remainingOfferIds = draft.payloads
      .filter((payload) => payload.publishable && payload.unitsPerPack !== unitsPerPack)
      .map((payload) => payload.offerId);
    const remaining = remainingOfferIds.length ? await pool.query(
      `SELECT count(*)::int AS total FROM scx_catalog_marketplace_offers
        WHERE id = ANY($1::text[]) AND external_id IS NULL`,
      [remainingOfferIds],
    ) : { rows: [{ total: 0 }] };
    const fullyPublished = Number(remaining.rows[0]?.total ?? 0) === 0;
    await pool.query(
      `UPDATE scx_mercado_livre_product_drafts SET status=$2,
         published_at=CASE WHEN $2='published' THEN now() ELSE published_at END,
         updated_at=now() WHERE product_id=$1`,
      [productId, fullyPublished ? "published" : "validated"],
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
