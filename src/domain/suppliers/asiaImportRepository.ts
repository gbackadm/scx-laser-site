import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabasePool } from "@/domain/catalog/db";

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
  updated_at: Date | string;
};

export type AsiaAutoSyncSettings = {
  isEnabled: boolean;
  intervalMinutes: number;
  batchSize: number;
  statusFilter: "true" | "false" | "all";
  lastAutoSyncAt?: string;
  nextAutoSyncAfter?: string;
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
  const variation = mainVariation(product);
  return parseAsiaStock(variation?.qtd_estoque);
}

function productPrice(product: AsiaImportProduct) {
  const variation = mainVariation(product);
  return (
    parseAsiaMoneyToCents(variation?.preco) ??
    parseAsiaMoneyToCents(product.preco)
  );
}

function productImages(product: AsiaImportProduct) {
  return [
    product.imagem,
    ...(Array.isArray(product.galeria) ? product.galeria : []),
  ].filter((value): value is string => Boolean(value));
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

export async function upsertAsiaSupplierProducts(products: AsiaImportProduct[]) {
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

    await pool.query(
      `
        UPDATE scx_catalog_products
        SET stock_quantity = $2,
          cost_amount_in_cents = COALESCE($3, cost_amount_in_cents),
          publication_status = CASE
            WHEN publication_status = 'out_of_stock'
              AND $2 >= (
                SELECT COALESCE(publication_stock_min_quantity, 1000)
                FROM scx_catalog_pricing_rules
                WHERE scope = 'global'
                  AND is_active = true
                ORDER BY updated_at DESC
                LIMIT 1
              )
              THEN 'published'
            WHEN publication_status = 'published'
              AND $2 < (
                SELECT COALESCE(publication_stock_min_quantity, 1000)
                FROM scx_catalog_pricing_rules
                WHERE scope = 'global'
                  AND is_active = true
                ORDER BY updated_at DESC
                LIMIT 1
              )
              THEN 'out_of_stock'
            ELSE publication_status
          END,
          updated_at = now()
        WHERE supplier_product_id = $1
      `,
      [supplierProductId, stockAvailable, suggestedPriceAmountInCents],
    );

    await pool.query(
      `
        UPDATE scx_catalog_supplier_products supplier_product
        SET import_status = 'mapped',
          updated_at = now()
        WHERE supplier_product.id = $1
          AND EXISTS (
            SELECT 1
            FROM scx_catalog_products catalog_product
            WHERE catalog_product.supplier_product_id = supplier_product.id
              OR catalog_product.sku = supplier_product.external_id
          )
      `,
      [supplierProductId],
    );

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
  const batchSize = Math.min(100, Math.max(1, Math.round(input.batchSize)));
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

  await pool.query("BEGIN");

  try {
    await pool.query(
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
    const scxSku = await nextScxSku(pool, categoryName);

    await pool.query(
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $8, 'tracked', $9, '{}')
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
      `,
      [
        catalogProductId,
        supplierProduct.external_id,
        scxSku,
        supplierProduct.raw_name,
        supplierProduct.raw_description,
        categoryId,
        supplierProduct.id,
        supplierProduct.suggested_price_amount_in_cents ?? 0,
        supplierProduct.stock_available ?? 0,
      ],
    );

    await pool.query(
      `
        DELETE FROM scx_catalog_product_images
        WHERE product_id = $1
      `,
      [catalogProductId],
    );

    for (const [index, url] of (
      supplierProduct.raw_image_urls ?? []
    ).entries()) {
      await pool.query(
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
        [randomUUID(), catalogProductId, url, supplierProduct.raw_name, index],
      );
    }

    await pool.query(
      `
        UPDATE scx_catalog_supplier_products
        SET import_status = 'mapped',
          updated_at = now()
        WHERE id = $1
      `,
      [supplierProduct.id],
    );

    await pool.query("COMMIT");

    return catalogProductId;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
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
  const settings = await getAsiaAutoSyncSettings();
  const now = new Date();
  const nextAutoSyncAfter = settings.nextAutoSyncAfter
    ? new Date(settings.nextAutoSyncAfter)
    : null;

  if (!settings.isEnabled) {
    return { skipped: true, reason: "Rotina Asia Import desativada." };
  }

  if (nextAutoSyncAfter && nextAutoSyncAfter > now) {
    return { skipped: true, reason: "Ainda nao chegou o horario da proxima rotina." };
  }

  const syncRunId = randomUUID();

  await getDatabasePool().query(
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
    const result = await syncCatalogProductsFromAsiaImportBatch(
      settings.batchSize,
      settings.statusFilter,
    );
    const nextRun = new Date(now.getTime() + settings.intervalMinutes * 60_000);

    await getDatabasePool().query(
      `
        UPDATE scx_catalog_sync_runs
        SET status = $2,
          finished_at = now(),
          imported_count = $3,
          mapped_count = $3,
          error_message = $4
        WHERE id = $1
      `,
      [
        syncRunId,
        result.errorCount > 0 ? "failed" : "completed",
        result.syncedCount,
        result.errors.slice(0, 5).join(" | ") || null,
      ],
    );

    await getDatabasePool().query(
      `
        UPDATE scx_supplier_auto_sync_settings
        SET last_auto_sync_at = $2,
          next_auto_sync_after = $3,
          updated_at = now()
        WHERE supplier_id = $1
      `,
      [supplierId, now, nextRun],
    );

    return {
      skipped: false,
      syncRunId,
      ...result,
      nextAutoSyncAfter: nextRun.toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";

    await getDatabasePool().query(
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
