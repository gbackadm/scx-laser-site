import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { getDatabasePool } from "@/domain/catalog/db";
import { buildMarketplaceTitle } from "@/domain/catalog/marketplaceTitles.js";

import {
  listAsiaImportProducts,
  parseAsiaMoneyToCents,
  parseAsiaStock,
  type AsiaImportProduct,
} from "./asiaImport";

const supplierId = "asia-import";
const supplierName = "Asia Import";

type AsiaAutoSyncSettingsRow = {
  is_enabled: boolean;
  interval_minutes: number;
  batch_size: number;
  status_filter: "true" | "false" | "all";
  last_auto_sync_at: Date | string | null;
  next_auto_sync_after: Date | string | null;
  next_page: number;
  updated_at: Date | string;
};

export type AsiaAutoSyncSettings = {
  isEnabled: boolean;
  intervalMinutes: number;
  batchSize: number;
  statusFilter: "true" | "false" | "all";
  lastAutoSyncAt?: string;
  nextAutoSyncAfter?: string;
  nextPage: number;
  updatedAt: string;
};

export type AsiaAutoSyncSettingsUpdate = {
  isEnabled: boolean;
  intervalMinutes: number;
  batchSize: number;
  statusFilter: "true" | "false" | "all";
  actorUserId: string;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : String(value);
}

function mapAsiaAutoSyncSettings(
  row: AsiaAutoSyncSettingsRow,
): AsiaAutoSyncSettings {
  return {
    isEnabled: row.is_enabled,
    intervalMinutes: row.interval_minutes,
    batchSize: row.batch_size,
    statusFilter: row.status_filter,
    lastAutoSyncAt: toIso(row.last_auto_sync_at),
    nextAutoSyncAfter: toIso(row.next_auto_sync_after),
    nextPage: row.next_page,
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function productExternalId(product: AsiaImportProduct) {
  return (
    product.referencia?.trim() ||
    mainVariation(product)?.referencia?.trim() ||
    randomUUID()
  );
}

function mainVariation(product: AsiaImportProduct) {
  return product.variacoes?.[0];
}

function productStock(product: AsiaImportProduct) {
  const variationStocks = (product.variacoes ?? [])
    .map((variation) => parseAsiaStock(variation.qtd_estoque))
    .filter((value): value is number => value !== undefined);

  if (variationStocks.length > 0) {
    return variationStocks.reduce((total, value) => total + Math.max(0, value), 0);
  }

  return parseAsiaStock(mainVariation(product)?.qtd_estoque);
}

function productPrice(product: AsiaImportProduct) {
  const variation = mainVariation(product);
  return (
    parseAsiaMoneyToCents(variation?.preco) ??
    parseAsiaMoneyToCents(product.preco)
  );
}

function productImages(product: AsiaImportProduct) {
  return Array.from(
    new Set(
      [
        product.imagem,
        ...(Array.isArray(product.galeria) ? product.galeria : []),
        ...(product.variacoes ?? []).map((variation) => variation.imagem),
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function attributeLabel(value: string) {
  const normalized = value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

const variationColorCodes: Record<string, string> = {
  AM: "Amarelo",
  AZ: "Azul",
  BR: "Branco",
  CF: "Cafe",
  CH: "Chocolate",
  CR: "Cru",
  CZ: "Cinza",
  DR: "Dourado",
  GF: "Grafite",
  LA: "Laranja",
  PT: "Preto",
  PR: "Prata",
  RS: "Rosa",
  RX: "Roxo",
  VD: "Verde",
  VM: "Vermelho",
};

function inferredVariationColor(...hints: Array<string | undefined>) {
  const normalizedHints = hints
    .map((hint) => hint?.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    .filter((hint): hint is string => Boolean(hint));
  const words: Array<[RegExp, string]> = [
    [/\bazul\b/i, "Azul"],
    [/\bpreto\b|\bpreta\b/i, "Preto"],
    [/\bbranco\b|\bbranca\b/i, "Branco"],
    [/\bvermelh[oa]\b/i, "Vermelho"],
    [/\bverde\b/i, "Verde"],
    [/\bcinza\b/i, "Cinza"],
    [/\bamarel[oa]\b/i, "Amarelo"],
    [/\brosa\b/i, "Rosa"],
    [/\brox[oa]\b/i, "Roxo"],
    [/\blaranja\b/i, "Laranja"],
    [/\bdourad[oa]\b/i, "Dourado"],
    [/\bprat[ae]\b|\bpratead[oa]\b/i, "Prata"],
    [/\bgrafite\b/i, "Grafite"],
    [/\bcru\b/i, "Cru"],
    [/\bcafe\b/i, "Cafe"],
  ];

  for (const hint of normalizedHints) {
    for (const [pattern, color] of words) {
      if (pattern.test(hint)) return color;
    }

    const tokens = hint.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      if (variationColorCodes[tokens[index]]) return variationColorCodes[tokens[index]];
    }
  }

  return undefined;
}

function variationAttributes(
  value: unknown,
  fallback: string,
  ...hints: Array<string | undefined>
) {
  const attributes: Record<string, string> = {};

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const item = entry as Record<string, unknown>;
      const name = attributeLabel(
        String(
          item.attribute ?? item.atributo ?? item.key ?? item.slug ?? item.name ?? item.nome ?? "",
        ),
      );
      const attributeValue = String(item.value ?? item.valor ?? "").trim();

      if (name && attributeValue) {
        attributes[name] = attributeValue;
      }
    }
  } else if (value && typeof value === "object") {
    for (const [key, rawValue] of Object.entries(value)) {
      if (rawValue && typeof rawValue === "object") {
        const item = rawValue as Record<string, unknown>;
        const name = attributeLabel(key);
        const attributeValue = String(
          item.value ?? item.valor ?? item.label ?? "",
        ).trim();

        if (name && attributeValue) {
          attributes[name] = attributeValue;
        }
      } else if (rawValue !== undefined && rawValue !== null) {
        attributes[key] = String(rawValue).trim();
      }
    }
  }

  const hasColor = Object.keys(attributes).some(
    (name) => attributeLabel(name).toLocaleLowerCase("pt-BR") === "cor",
  );
  const inferredColor = hasColor ? undefined : inferredVariationColor(...hints);

  if (inferredColor) attributes.Cor = inferredColor;
  return Object.keys(attributes).length > 0 ? attributes : { Modelo: fallback || "Padrao" };
}

function variationImage(
  product: AsiaImportProduct,
  variation: NonNullable<AsiaImportProduct["variacoes"]>[number],
) {
  const directImage = variation.imagem?.trim();
  if (directImage) return directImage;

  const candidates = productImages(product);
  if (candidates.length === 1 && (product.variacoes?.length ?? 0) === 1) {
    return candidates[0];
  }

  const skuToken = variation.referencia
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  const bySku = candidates.find((url) =>
    skuToken
      ? url.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().includes(skuToken)
      : false,
  );
  if (bySku) return bySku;

  const color = inferredVariationColor(
    variation.referencia,
    variation.nome,
    product.nome,
  );
  if (!color) return undefined;

  const colorToken = color.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return candidates.find((url) => url.toLowerCase().includes(colorToken));
}

function automaticCatalogBlockReasons(product: AsiaImportProduct) {
  const reasons: string[] = [];
  const variations = product.variacoes ?? [];

  if (productImages(product).length === 0) reasons.push("imagem ausente");
  if ((productPrice(product) ?? 0) <= 0) reasons.push("custo ausente ou invalido");
  if (variations.length === 0) reasons.push("variacoes ausentes");
  if (
    variations.some(
      (variation) =>
        (parseAsiaMoneyToCents(variation.preco) ?? productPrice(product) ?? 0) <= 0,
    )
  ) {
    reasons.push("variacao sem custo valido");
  }
  if (variations.some((variation) => !variationImage(product, variation))) {
    reasons.push("variacao sem imagem identificavel");
  }

  return Array.from(new Set(reasons));
}

function generatedVariationScxSku(parentScxSku: string, supplierSku: string) {
  const code = createHash("sha1").update(supplierSku).digest("hex").slice(0, 5);
  const suffix = `-${code.toUpperCase()}`;
  return `${parentScxSku.slice(0, 30 - suffix.length)}${suffix}`;
}

async function syncAsiaVariationsForCatalogProduct(
  pool: Pick<PoolClient, "query">,
  catalogProductId: string,
  product: AsiaImportProduct,
) {
  const variations = product.variacoes ?? [];

  if (variations.length === 0) {
    return;
  }

  const parentResult = await pool.query<{ scx_sku: string | null }>(
    `SELECT scx_sku FROM scx_catalog_products WHERE id = $1 LIMIT 1`,
    [catalogProductId],
  );
  const parentScxSku = parentResult.rows[0]?.scx_sku;

  if (!parentScxSku) {
    return;
  }

  await pool.query(
    `
      UPDATE scx_catalog_product_variants
      SET is_active = false,
        stock_quantity = 0,
        updated_at = now()
      WHERE product_id = $1
        AND source = 'supplier'
    `,
    [catalogProductId],
  );

  for (const [index, variation] of variations.entries()) {
    const supplierSku =
      variation.referencia?.trim() ||
      `${productExternalId(product)}-${String(index + 1).padStart(2, "0")}`;
    const name = variation.nome?.trim() || supplierSku;
    const costAmountInCents =
      parseAsiaMoneyToCents(variation.preco) ?? productPrice(product) ?? 0;

    if (costAmountInCents <= 0) {
      continue;
    }

    const existingResult = await pool.query<{ id: string; scx_sku: string }>(
      `
        SELECT id, scx_sku
        FROM scx_catalog_product_variants
        WHERE product_id = $1
          AND supplier_sku = $2
        LIMIT 1
      `,
      [catalogProductId, supplierSku],
    );
    const variantId = existingResult.rows[0]?.id ?? randomUUID();
    const scxSku =
      existingResult.rows[0]?.scx_sku ??
      generatedVariationScxSku(parentScxSku, supplierSku);
    const attributes = variationAttributes(
      variation.atributos,
      name,
      supplierSku,
      name,
      product.nome,
    );
    const stockQuantity = Math.max(0, parseAsiaStock(variation.qtd_estoque) ?? 0);
    const priceAmountInCents = Math.round(costAmountInCents * 2.2);

    await pool.query(
      `
        INSERT INTO scx_catalog_product_variants (
          id,
          product_id,
          scx_sku,
          supplier_sku,
          name,
          price_amount_in_cents,
          cost_amount_in_cents,
          stock_quantity,
          attributes,
          source,
          is_active,
          sort_order,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'supplier', true, $10, now())
        ON CONFLICT (product_id, supplier_sku)
        DO UPDATE SET
          name = EXCLUDED.name,
          price_amount_in_cents = EXCLUDED.price_amount_in_cents,
          cost_amount_in_cents = EXCLUDED.cost_amount_in_cents,
          stock_quantity = EXCLUDED.stock_quantity,
          attributes = EXCLUDED.attributes,
          source = 'supplier',
          is_active = true,
          sort_order = EXCLUDED.sort_order,
          updated_at = now()
      `,
      [
        variantId,
        catalogProductId,
        scxSku,
        supplierSku,
        name,
        priceAmountInCents,
        costAmountInCents,
        stockQuantity,
        JSON.stringify(attributes),
        index,
      ],
    );

    await pool.query(
      `DELETE FROM scx_catalog_product_variant_images WHERE variant_id = $1`,
      [variantId],
    );

    const resolvedVariationImage = variationImage(product, variation);
    if (resolvedVariationImage) {
      await pool.query(
        `
          INSERT INTO scx_catalog_product_variant_images (
            id,
            variant_id,
            url,
            alt_text,
            sort_order
          )
          VALUES ($1, $2, $3, $4, 0)
        `,
        [randomUUID(), variantId, resolvedVariationImage, name],
      );
    }
  }

  await pool.query(
    `
      UPDATE scx_catalog_products product
      SET stock_quantity = totals.stock_quantity,
        price_amount_in_cents = COALESCE(totals.price_amount_in_cents, product.price_amount_in_cents),
        cost_amount_in_cents = COALESCE(totals.cost_amount_in_cents, product.cost_amount_in_cents),
        publication_status = CASE
          WHEN product.publication_status IN ('published', 'out_of_stock')
            AND totals.stock_quantity >= (
              SELECT COALESCE(publication_stock_min_quantity, 1000)
              FROM scx_catalog_pricing_rules
              WHERE scope = 'global' AND is_active = true
              ORDER BY updated_at DESC
              LIMIT 1
            ) THEN 'published'
          WHEN product.publication_status IN ('published', 'out_of_stock')
            THEN 'out_of_stock'
          ELSE product.publication_status
        END,
        updated_at = now()
      FROM (
        SELECT
          product_id,
          COALESCE(sum(stock_quantity) FILTER (WHERE is_active), 0)::int AS stock_quantity,
          min(price_amount_in_cents) FILTER (WHERE is_active) AS price_amount_in_cents,
          min(cost_amount_in_cents) FILTER (WHERE is_active) AS cost_amount_in_cents
        FROM scx_catalog_product_variants
        WHERE product_id = $1
        GROUP BY product_id
      ) totals
      WHERE product.id = totals.product_id
    `,
    [catalogProductId],
  );
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function productCategory(product: AsiaImportProduct) {
  const categorias = product.categorias;

  if (Array.isArray(categorias)) {
    return categorias.find((category) => String(category).trim()) ?? null;
  }

  if (categorias && typeof categorias === "object") {
    const values = Object.values(categorias)
      .map((category) => decodeHtmlEntities(String(category).trim()))
      .filter((category) => category && category.toLowerCase() !== "sem categoria");

    return values[0] ?? null;
  }

  return null;
}

function productMatchesExternalId(product: AsiaImportProduct, externalId: string) {
  const reference = product.referencia?.trim();

  if (reference === externalId) {
    return true;
  }

  return (product.variacoes ?? []).some(
    (variation) => variation.referencia?.trim() === externalId,
  );
}

function scxSkuPrefix(categoryName: string) {
  return (
    categoryName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "PRO"
  );
}

async function nextScxSku(
  pool: {
    query: (
      text: string,
      params?: unknown[],
    ) => Promise<{ rows: Array<{ scx_sku: string | null }> }>;
  },
  categoryName: string,
) {
  const prefix = scxSkuPrefix(categoryName);
  const result = await pool.query(
    `
      SELECT scx_sku
      FROM scx_catalog_products
      WHERE scx_sku LIKE $1
    `,
    [`SCX-${prefix}-%`],
  );
  const lastSequence = result.rows.reduce((maxSequence, row) => {
    const match = row.scx_sku?.match(/-(\d+)$/);
    const sequence = match ? Number(match[1]) : 0;

    return Number.isFinite(sequence)
      ? Math.max(maxSequence, sequence)
      : maxSequence;
  }, 0);

  return `SCX-${prefix}-${String(lastSequence + 1).padStart(4, "0")}`;
}

export async function upsertAsiaSupplierProducts(
  products: AsiaImportProduct[],
  options: { ensureCatalogProduct?: boolean } = {},
) {
  const pool = getDatabasePool();
  let importedCount = 0;

  for (const product of products) {
    const externalId = productExternalId(product);
    const supplierProductId = `asia-${externalId}`;
    const stockAvailable = productStock(product) ?? 0;
    const suggestedPriceAmountInCents = productPrice(product) ?? null;

    await pool.query(
      `
        INSERT INTO scx_catalog_supplier_products (
          id,
          supplier_id,
          supplier_name,
          external_id,
          raw_name,
          raw_description,
          raw_category,
          raw_image_urls,
          suggested_price_amount_in_cents,
          stock_available,
          last_imported_at,
          import_status,
          raw_payload
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          now(),
          'pending_review',
          $11::jsonb
        )
        ON CONFLICT (supplier_id, external_id)
        DO UPDATE SET
          raw_name = EXCLUDED.raw_name,
          raw_description = EXCLUDED.raw_description,
          raw_category = EXCLUDED.raw_category,
          raw_image_urls = EXCLUDED.raw_image_urls,
          suggested_price_amount_in_cents = EXCLUDED.suggested_price_amount_in_cents,
          stock_available = EXCLUDED.stock_available,
          last_imported_at = now(),
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [
        supplierProductId,
        supplierId,
        supplierName,
        externalId,
        product.nome ?? externalId,
        product.descricao ?? null,
        productCategory(product),
        productImages(product),
        suggestedPriceAmountInCents,
        stockAvailable,
        JSON.stringify(product),
      ],
    );

    if (options.ensureCatalogProduct) {
      const blockReasons = automaticCatalogBlockReasons(product);
      if (blockReasons.length > 0) {
        await pool.query(
          `
            UPDATE scx_catalog_supplier_products
            SET import_status = 'sync_error', updated_at = now()
            WHERE id = $1
          `,
          [supplierProductId],
        );
        throw new Error(`Produto bloqueado: ${blockReasons.join(", ")}.`);
      }
    }

    const catalogProductResult = await pool.query<{ id: string }>(
      `
        SELECT id
        FROM scx_catalog_products
        WHERE supplier_product_id = $1
           OR sku = $2
        LIMIT 1
      `,
      [supplierProductId, externalId],
    );

    if (catalogProductResult.rows[0] || options.ensureCatalogProduct) {
      await createCatalogDraftFromSupplierProduct(supplierProductId, {
        publishNewProductByStock: options.ensureCatalogProduct,
      });
    }

    importedCount += 1;
  }

  return importedCount;
}

export async function getAsiaAutoSyncSettings() {
  const { rows } = await getDatabasePool().query<AsiaAutoSyncSettingsRow>(
    `
      INSERT INTO scx_supplier_auto_sync_settings (supplier_id)
      VALUES ($1)
      ON CONFLICT (supplier_id) DO UPDATE SET supplier_id = EXCLUDED.supplier_id
      RETURNING *
    `,
    [supplierId],
  );

  return mapAsiaAutoSyncSettings(rows[0]);
}

export async function updateAsiaAutoSyncSettings(
  input: AsiaAutoSyncSettingsUpdate,
) {
  const intervalMinutes = Math.max(10, Math.round(input.intervalMinutes));
  const batchSize = Math.min(10, Math.max(1, Math.round(input.batchSize)));
  const nextAutoSyncAfter = input.isEnabled
    ? new Date(Date.now() + intervalMinutes * 60_000)
    : null;
  const { rows } = await getDatabasePool().query<AsiaAutoSyncSettingsRow>(
    `
      INSERT INTO scx_supplier_auto_sync_settings (
        supplier_id,
        is_enabled,
        interval_minutes,
        batch_size,
        status_filter,
        next_auto_sync_after,
        updated_by,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (supplier_id)
      DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        interval_minutes = EXCLUDED.interval_minutes,
        batch_size = EXCLUDED.batch_size,
        status_filter = EXCLUDED.status_filter,
        next_auto_sync_after = EXCLUDED.next_auto_sync_after,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING *
    `,
    [
      supplierId,
      input.isEnabled,
      intervalMinutes,
      batchSize,
      input.statusFilter,
      nextAutoSyncAfter,
      input.actorUserId,
    ],
  );

  return mapAsiaAutoSyncSettings(rows[0]);
}

export async function listAsiaSupplierProductsForReview(limit = 20) {
  const result = await getDatabasePool().query(
    `
      SELECT
        supplier_product.*,
        catalog_product.id AS catalog_product_id,
        catalog_product.publication_status AS catalog_publication_status,
        CASE
          WHEN catalog_product.id IS NOT NULL THEN 'mapped'
          WHEN supplier_product.import_status = 'mapped' THEN 'pending_review'
          ELSE supplier_product.import_status
        END AS catalog_import_status
      FROM scx_catalog_supplier_products supplier_product
      LEFT JOIN scx_catalog_products catalog_product
        ON catalog_product.supplier_product_id = supplier_product.id
          OR catalog_product.sku = supplier_product.external_id
      WHERE supplier_product.supplier_id = $1
        AND COALESCE(supplier_product.stock_available, 0) > 0
        AND EXISTS (
          SELECT 1
          FROM unnest(supplier_product.raw_image_urls) AS image_url
          WHERE btrim(image_url) <> ''
        )
      ORDER BY supplier_product.last_imported_at DESC, supplier_product.raw_name ASC
      LIMIT $2
    `,
    [supplierId, limit],
  );

  return result.rows;
}

export async function createCatalogDraftFromSupplierProduct(
  supplierProductId: string,
  options: { publishNewProductByStock?: boolean } = {},
) {
  const pool = getDatabasePool();

  const supplierResult = await pool.query(
    `
      SELECT *
      FROM scx_catalog_supplier_products
      WHERE id = $1
        AND supplier_id = $2
      LIMIT 1
    `,
    [supplierProductId, supplierId],
  );
  const supplierProduct = supplierResult.rows[0];

  if (!supplierProduct) {
    throw new Error("Produto importado nao encontrado.");
  }

  const categoryName = supplierProduct.raw_category || "Sem categoria";
  const categoryId = `cat-${categoryName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sem-categoria"}`;
  const minimumStockResult = await pool.query<{ minimum_stock: number }>(
    `
      SELECT COALESCE(publication_stock_min_quantity, 1000)::int AS minimum_stock
      FROM scx_catalog_pricing_rules
      WHERE scope = 'global'
        AND is_active = true
      ORDER BY updated_at DESC
      LIMIT 1
    `,
  );
  const minimumStock = minimumStockResult.rows[0]?.minimum_stock ?? 1000;
  const initialPublicationStatus = options.publishNewProductByStock
    ? (supplierProduct.stock_available ?? 0) >= minimumStock
      ? "published"
      : "out_of_stock"
    : "draft";

  const client = await pool.connect();
  await client.query("BEGIN");

  try {
    await client.query(
      `
        INSERT INTO scx_catalog_categories (id, name, slug, sort_order)
        VALUES ($1, $2, $1, 900)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = now()
      `,
      [categoryId, categoryName],
    );

    const catalogProductId = `catalog-${supplierProduct.external_id}`;
    const scxSku = await nextScxSku(client, categoryName);
    const commercialTitle = buildMarketplaceTitle(
      supplierProduct.raw_name,
      "mercado_livre",
      { identifiers: [scxSku, supplierProduct.external_id] },
    );

    if (!commercialTitle) {
      throw new Error("Produto importado sem titulo comercial valido.");
    }

    const catalogProductResult = await client.query<{ id: string }>(
      `
        INSERT INTO scx_catalog_products (
          id,
          sku,
          scx_sku,
          title,
          description,
          category_id,
          supplier_product_id,
          publication_status,
          price_amount_in_cents,
          cost_amount_in_cents,
          stock_policy,
          stock_quantity,
          tags
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'tracked', $11, '{}')
        ON CONFLICT (sku) DO UPDATE SET
          scx_sku = COALESCE(scx_catalog_products.scx_sku, EXCLUDED.scx_sku),
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          category_id = EXCLUDED.category_id,
          supplier_product_id = EXCLUDED.supplier_product_id,
          cost_amount_in_cents = EXCLUDED.cost_amount_in_cents,
          stock_quantity = EXCLUDED.stock_quantity,
          publication_status = CASE
            WHEN scx_catalog_products.publication_status = 'out_of_stock'
              AND EXCLUDED.stock_quantity >= (
                SELECT COALESCE(publication_stock_min_quantity, 1000)
                FROM scx_catalog_pricing_rules
                WHERE scope = 'global'
                  AND is_active = true
                ORDER BY updated_at DESC
                LIMIT 1
              )
              THEN 'published'
            WHEN scx_catalog_products.publication_status = 'published'
              AND EXCLUDED.stock_quantity < (
                SELECT COALESCE(publication_stock_min_quantity, 1000)
                FROM scx_catalog_pricing_rules
                WHERE scope = 'global'
                  AND is_active = true
                ORDER BY updated_at DESC
                LIMIT 1
              )
              THEN 'out_of_stock'
            ELSE scx_catalog_products.publication_status
          END,
          updated_at = now()
        RETURNING id
      `,
      [
        catalogProductId,
        supplierProduct.external_id,
        scxSku,
        commercialTitle,
        supplierProduct.raw_description,
        categoryId,
        supplierProduct.id,
        initialPublicationStatus,
        Math.round((supplierProduct.suggested_price_amount_in_cents ?? 0) * 2.2),
        supplierProduct.suggested_price_amount_in_cents ?? 0,
        supplierProduct.stock_available ?? 0,
      ],
    );
    const resolvedCatalogProductId =
      catalogProductResult.rows[0]?.id ?? catalogProductId;

    await syncAsiaVariationsForCatalogProduct(
      client,
      resolvedCatalogProductId,
      supplierProduct.raw_payload as AsiaImportProduct,
    );

    await client.query(
      `
        DELETE FROM scx_catalog_product_images
        WHERE product_id = $1
      `,
      [resolvedCatalogProductId],
    );

    for (const [index, url] of (
      supplierProduct.raw_image_urls ?? []
    ).entries()) {
      await client.query(
        `
          INSERT INTO scx_catalog_product_images (
            id,
            product_id,
            url,
            alt_text,
            source,
            sort_order
          )
          VALUES ($1, $2, $3, $4, 'supplier', $5)
        `,
        [randomUUID(), resolvedCatalogProductId, url, supplierProduct.raw_name, index],
      );
    }

    await client.query(
      `
        UPDATE scx_catalog_supplier_products
        SET import_status = 'mapped',
          updated_at = now()
        WHERE id = $1
      `,
      [supplierProduct.id],
    );

    await client.query("COMMIT");

    return resolvedCatalogProductId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function supplierProductHasCatalogProduct(supplierProductId: string) {
  const result = await getDatabasePool().query(
    `
      SELECT 1
      FROM scx_catalog_supplier_products supplier_product
      INNER JOIN scx_catalog_products catalog_product
        ON catalog_product.supplier_product_id = supplier_product.id
          OR catalog_product.sku = supplier_product.external_id
      WHERE supplier_product.id = $1
        AND supplier_product.supplier_id = $2
      LIMIT 1
    `,
    [supplierProductId, supplierId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function markSupplierProductPendingIfUnmapped(
  supplierProductId: string,
) {
  await getDatabasePool().query(
    `
      UPDATE scx_catalog_supplier_products supplier_product
      SET import_status = 'pending_review',
        updated_at = now()
      WHERE supplier_product.id = $1
        AND supplier_product.supplier_id = $2
        AND supplier_product.import_status = 'mapped'
        AND NOT EXISTS (
          SELECT 1
          FROM scx_catalog_products catalog_product
          WHERE catalog_product.supplier_product_id = supplier_product.id
            OR catalog_product.sku = supplier_product.external_id
        )
    `,
    [supplierProductId, supplierId],
  );
}

export async function syncCatalogProductFromAsiaImport(
  catalogProductId: string,
  status: "true" | "false" | "all" = "all",
) {
  const pool = getDatabasePool();
  const productResult = await pool.query(
    `
      SELECT sp.external_id
      FROM scx_catalog_products product
      INNER JOIN scx_catalog_supplier_products sp
        ON sp.id = product.supplier_product_id
      WHERE product.id = $1
        AND sp.supplier_id = $2
      LIMIT 1
    `,
    [catalogProductId, supplierId],
  );
  const externalId = productResult.rows[0]?.external_id;

  if (!externalId) {
    throw new Error("Produto sem fornecedor Asia Import vinculado.");
  }

  const result = await listAsiaImportProducts({
    pagina: 1,
    porPagina: 10,
    referencia: externalId,
    status,
  });
  const supplierProduct =
    result.produtos?.find((product) => productMatchesExternalId(product, externalId)) ??
    result.produtos?.[0];

  if (!supplierProduct) {
    throw new Error("Produto nao encontrado na Asia Import.");
  }

  await upsertAsiaSupplierProducts([
    productExternalId(supplierProduct) === externalId
      ? supplierProduct
      : { ...supplierProduct, referencia: externalId },
  ]);
  await createCatalogDraftFromSupplierProduct(`asia-${externalId}`);

  return catalogProductId;
}

export async function syncAllCatalogProductsFromAsiaImport() {
  const pool = getDatabasePool();
  const linkedProductsResult = await pool.query<{ id: string }>(
    `
      SELECT product.id
      FROM scx_catalog_products product
      INNER JOIN scx_catalog_supplier_products sp
        ON sp.id = product.supplier_product_id
      WHERE sp.supplier_id = $1
      ORDER BY product.updated_at DESC, product.title ASC
    `,
    [supplierId],
  );
  let syncedCount = 0;
  const errors: string[] = [];

  for (const row of linkedProductsResult.rows) {
    try {
      await syncCatalogProductFromAsiaImport(row.id);
      syncedCount += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Erro desconhecido.");
    }
  }

  return {
    totalCount: linkedProductsResult.rowCount ?? linkedProductsResult.rows.length,
    syncedCount,
    errorCount: errors.length,
  };
}

export async function syncCatalogProductsFromAsiaImportBatch(
  limit = 10,
  status: "true" | "false" | "all" = "all",
) {
  const pool = getDatabasePool();
  const safeLimit = Math.min(100, Math.max(1, Math.round(limit)));
  const linkedProductsResult = await pool.query<{ id: string }>(
    `
      SELECT product.id
      FROM scx_catalog_products product
      INNER JOIN scx_catalog_supplier_products sp
        ON sp.id = product.supplier_product_id
      WHERE sp.supplier_id = $1
      ORDER BY sp.last_imported_at ASC, product.updated_at ASC, product.title ASC
      LIMIT $2
    `,
    [supplierId, safeLimit],
  );
  let syncedCount = 0;
  const errors: string[] = [];

  for (const row of linkedProductsResult.rows) {
    try {
      await syncCatalogProductFromAsiaImport(row.id, status);
      syncedCount += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Erro desconhecido.");
    }
  }

  return {
    totalCount: linkedProductsResult.rowCount ?? linkedProductsResult.rows.length,
    syncedCount,
    errorCount: errors.length,
    errors,
  };
}

export async function runScheduledAsiaImportSyncIfDue() {
  const pool = getDatabasePool();

  await pool.query(
    `
      UPDATE scx_catalog_sync_runs
      SET status = 'failed',
        finished_at = now(),
        error_message = COALESCE(error_message, 'Execucao anterior interrompida pelo limite de tempo.')
      WHERE source = 'supplier_import'
        AND status = 'running'
        AND started_at < now() - interval '3 minutes'
    `,
  );

  const claimResult = await pool.query<AsiaAutoSyncSettingsRow>(
    `
      UPDATE scx_supplier_auto_sync_settings
      SET next_auto_sync_after = now() + make_interval(mins => interval_minutes),
        updated_at = now()
      WHERE supplier_id = $1
        AND is_enabled = true
        AND (next_auto_sync_after IS NULL OR next_auto_sync_after <= now())
      RETURNING *
    `,
    [supplierId],
  );
  const claimedSettings = claimResult.rows[0];

  if (!claimedSettings) {
    const settings = await getAsiaAutoSyncSettings();
    return {
      skipped: true,
      reason: settings.isEnabled
        ? "Ainda nao chegou o horario da proxima rotina."
        : "Rotina Asia Import desativada.",
    };
  }

  const settings = mapAsiaAutoSyncSettings(claimedSettings);

  const syncRunId = randomUUID();

  await pool.query(
    `
      INSERT INTO scx_catalog_sync_runs (
        id,
        source,
        status,
        imported_count,
        mapped_count
      )
      VALUES ($1, 'supplier_import', 'running', 0, 0)
    `,
    [syncRunId],
  );

  try {
    const page = Math.max(1, settings.nextPage || 1);
    const response = await listAsiaImportProducts({
      pagina: page,
      porPagina: Math.min(settings.batchSize, 10),
      status: settings.statusFilter,
    });
    const products = response.produtos ?? [];
    const errors: string[] = [];
    let syncedCount = 0;

    for (const product of products) {
      try {
        await upsertAsiaSupplierProducts([product], {
          ensureCatalogProduct: true,
        });
        syncedCount += 1;
      } catch (error) {
        const reference = productExternalId(product);
        const message = error instanceof Error ? error.message : "Erro desconhecido.";
        errors.push(`${reference}: ${message}`);
      }
    }

    const currentPage = Math.max(1, response.pagina ?? page);
    const totalPages = Math.max(1, response.total_paginas ?? currentPage);
    const nextPage = currentPage >= totalPages ? 1 : currentPage + 1;

    await pool.query(
      `
        UPDATE scx_catalog_sync_runs
        SET status = $2,
          finished_at = now(),
          imported_count = $3,
          mapped_count = $4,
          error_message = $5
        WHERE id = $1
      `,
      [
        syncRunId,
        errors.length > 0 ? "failed" : "completed",
        products.length,
        syncedCount,
        errors.slice(0, 5).join(" | ") || null,
      ],
    );

    await pool.query(
      `
        UPDATE scx_supplier_auto_sync_settings
        SET last_auto_sync_at = $2,
          next_page = $3,
          updated_at = now()
        WHERE supplier_id = $1
      `,
      [supplierId, new Date(), nextPage],
    );

    return {
      skipped: false,
      syncRunId,
      page: currentPage,
      nextPage,
      totalPages,
      totalCount: products.length,
      syncedCount,
      errorCount: errors.length,
      errors,
      nextAutoSyncAfter: settings.nextAutoSyncAfter,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";

    await pool.query(
      `
        UPDATE scx_catalog_sync_runs
        SET status = 'failed',
          finished_at = now(),
          error_message = $2
        WHERE id = $1
      `,
      [syncRunId, message],
    );

    throw error;
  }
}
