import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  const match = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m);
  if (match) {
    process.env.DATABASE_URL = match[1].trim();
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL nao configurada.");
}

async function imageStatus(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1023" },
      signal: AbortSignal.timeout(12_000),
    });

    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

try {
  const [catalog, supplier, variants, integrity, images, asiaSettings, latestRuns] =
    await Promise.all([
      pool.query(`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE publication_status = 'published')::int AS published,
          count(*) FILTER (WHERE publication_status = 'out_of_stock')::int AS out_of_stock,
          count(*) FILTER (WHERE publication_status = 'draft')::int AS draft,
          count(*) FILTER (WHERE publication_status = 'hidden')::int AS hidden,
          count(*) FILTER (WHERE stock_quantity > 0)::int AS with_stock,
          count(*) FILTER (WHERE stock_quantity >= 1000)::int AS with_publishable_stock
        FROM scx_catalog_products
      `),
      pool.query(`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE import_status = 'mapped')::int AS mapped,
          count(*) FILTER (WHERE import_status = 'pending_review')::int AS pending_review,
          count(*) FILTER (
            WHERE jsonb_typeof(raw_payload->'variacoes') = 'array'
              AND jsonb_array_length(raw_payload->'variacoes') > 0
          )::int AS with_variations,
          count(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1
              FROM scx_catalog_products product
              WHERE product.supplier_product_id = supplier.id
                 OR product.sku = supplier.external_id
            )
          )::int AS without_catalog_product
        FROM scx_catalog_supplier_products supplier
        WHERE supplier_id = 'asia-import'
      `),
      pool.query(`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE is_active)::int AS active,
          count(*) FILTER (
            WHERE is_active
              AND NOT EXISTS (
                SELECT 1
                FROM scx_catalog_product_variant_images image
                WHERE image.variant_id = variant.id
                  AND btrim(image.url) <> ''
              )
          )::int AS active_without_images,
          count(*) FILTER (
            WHERE is_active
              AND btrim(COALESCE(attributes->>'Cor', '')) = ''
          )::int AS active_without_color
        FROM scx_catalog_product_variants variant
      `),
      pool.query(`
        SELECT
          count(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM scx_catalog_product_variants variant
              WHERE variant.product_id = product.id
            )
          )::int AS products_without_variants,
          count(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM scx_catalog_product_images image
              WHERE image.product_id = product.id AND btrim(image.url) <> ''
            )
          )::int AS products_without_images,
          count(*) FILTER (
            WHERE product.publication_status = 'published'
              AND NOT EXISTS (
                SELECT 1 FROM scx_catalog_product_images image
                WHERE image.product_id = product.id AND btrim(image.url) <> ''
              )
          )::int AS published_without_images,
          count(*) FILTER (
            WHERE product.publication_status = 'published'
              AND product.stock_quantity <= 0
          )::int AS published_without_stock
        FROM scx_catalog_products product
      `),
      pool.query(`
        SELECT DISTINCT ON (product.id)
          product.id AS product_id,
          product.title,
          product.publication_status,
          image.url
        FROM scx_catalog_products product
        INNER JOIN scx_catalog_product_images image ON image.product_id = product.id
        WHERE btrim(image.url) <> ''
        ORDER BY product.id, image.sort_order, image.id
      `),
      pool.query(`
        SELECT *
        FROM scx_supplier_auto_sync_settings
        WHERE supplier_id = 'asia-import'
      `),
      pool.query(`
        SELECT id, status, imported_count, mapped_count, error_message,
          started_at, finished_at
        FROM scx_catalog_sync_runs
        WHERE source = 'supplier_import'
        ORDER BY started_at DESC
        LIMIT 10
      `),
    ]);

  const imageChecks = [];
  for (let index = 0; index < images.rows.length; index += 10) {
    imageChecks.push(
      ...(await Promise.all(
        images.rows.slice(index, index + 10).map(async (row) => ({
          productId: row.product_id,
          title: row.title,
          publicationStatus: row.publication_status,
          ...(await imageStatus(row.url)),
        })),
      )),
    );
  }

  const failedImages = imageChecks.filter(
    (image) => !image.ok || !String(image.contentType ?? "").startsWith("image/"),
  );

  console.log(
    JSON.stringify(
      {
        catalog: catalog.rows[0],
        supplier: supplier.rows[0],
        variants: variants.rows[0],
        integrity: integrity.rows[0],
        imageHealth: {
          checkedProducts: imageChecks.length,
          healthy: imageChecks.length - failedImages.length,
          failed: failedImages.length,
          failures: failedImages,
        },
        asiaSettings: asiaSettings.rows[0] ?? null,
        latestAsiaRuns: latestRuns.rows,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
