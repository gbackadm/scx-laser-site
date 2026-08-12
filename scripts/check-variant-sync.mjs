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

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  const [tables, settings, source, variants, channel, latestRun, integrity, grades] =
    await Promise.all([
    pool.query(`
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        count(a.attname) FILTER (WHERE a.attnum > 0 AND NOT a.attisdropped)::int AS columns
      FROM pg_class c
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'scx_catalog_product_variants',
          'scx_catalog_product_variant_images',
          'scx_catalog_product_variant_channel_mappings'
        )
      GROUP BY c.relname, c.relrowsecurity
      ORDER BY c.relname
    `),
    pool.query(`
      SELECT
        is_enabled,
        auto_sync_enabled,
        auto_sync_mode,
        batch_size,
        batch_calls_per_minute
      FROM scx_olist_sync_settings
      WHERE id = 'default'
    `),
    pool.query(`
      SELECT
        count(*) FILTER (
          WHERE jsonb_typeof(raw_payload->'variacoes') = 'array'
            AND jsonb_array_length(raw_payload->'variacoes') > 0
        )::int AS products_with_source_variants,
        count(*)::int AS asia_products
      FROM scx_catalog_supplier_products
      WHERE supplier_id = 'asia-import'
    `),
    pool.query(`
      SELECT
        count(*)::int AS variants,
        count(*) FILTER (WHERE is_active)::int AS active_variants,
        count(DISTINCT product_id)::int AS products_with_variants,
        COALESCE(sum(stock_quantity) FILTER (WHERE is_active), 0)::int AS total_stock
      FROM scx_catalog_product_variants
    `),
    pool.query(`
      SELECT
        (SELECT count(*)::int FROM scx_catalog_product_channel_mappings WHERE channel = 'olist' AND sync_status = 'synced') AS synced_products,
        (SELECT count(*)::int FROM scx_catalog_product_variant_channel_mappings WHERE channel = 'olist' AND sync_status = 'synced') AS synced_variants,
        (SELECT count(*)::int FROM scx_catalog_product_channel_mappings WHERE channel = 'olist' AND sync_status = 'failed') AS failed_products
    `),
    pool.query(`
      SELECT
        id,
        mode,
        trigger_source,
        status,
        selected_products,
        eligible_products,
        blocked_products,
        result_snapshot,
        error_message,
        started_at,
        finished_at
      FROM scx_olist_sync_runs
      ORDER BY created_at DESC
      LIMIT 1
    `),
    pool.query(`
      SELECT
        count(*) FILTER (
          WHERE btrim(scx_sku) = ''
             OR btrim(supplier_sku) = ''
             OR price_amount_in_cents <= 0
             OR cost_amount_in_cents <= 0
             OR attributes = '{}'::jsonb
        )::int AS incomplete_variants,
        (
          SELECT count(*)::int
          FROM (
            SELECT product_id, attributes
            FROM scx_catalog_product_variants
            WHERE is_active
            GROUP BY product_id, attributes
            HAVING count(*) > 1
          ) duplicate_grades
        ) AS duplicate_grades,
        (
          SELECT count(*)::int
          FROM scx_catalog_products product
          WHERE product.publication_status <> 'draft'
            AND NOT EXISTS (
              SELECT 1
              FROM scx_catalog_product_images image
              WHERE image.product_id = product.id
                AND btrim(image.url) <> ''
            )
        ) AS public_products_without_images
      FROM scx_catalog_product_variants
    `),
    pool.query(`
      WITH variant_schemas AS (
        SELECT
          variant.product_id,
          variant.id AS variant_id,
          count(attribute.key)::int AS level_count,
          COALESCE(string_agg(lower(btrim(attribute.key)), ',' ORDER BY lower(btrim(attribute.key))), '') AS key_set
        FROM scx_catalog_product_variants variant
        LEFT JOIN LATERAL jsonb_each_text(variant.attributes) attribute ON true
        WHERE variant.is_active
        GROUP BY variant.product_id, variant.id
      ), product_schemas AS (
        SELECT
          product_id,
          count(DISTINCT level_count)::int AS distinct_level_counts,
          count(DISTINCT key_set)::int AS distinct_key_sets,
          array_agg(DISTINCT level_count ORDER BY level_count) AS level_counts,
          array_agg(DISTINCT key_set ORDER BY key_set) AS key_sets
        FROM variant_schemas
        GROUP BY product_id
      )
      SELECT
        count(*) FILTER (WHERE distinct_level_counts > 1)::int AS products_with_mixed_level_counts,
        count(*) FILTER (WHERE distinct_key_sets > 1)::int AS products_with_mixed_key_sets,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'product_id', product_id,
              'level_counts', level_counts,
              'key_sets', key_sets
            )
          ) FILTER (WHERE distinct_level_counts > 1 OR distinct_key_sets > 1),
          '[]'::jsonb
        ) AS samples
      FROM product_schemas
    `),
  ]);

  console.log(
    JSON.stringify(
      {
        tables: tables.rows,
        settings: settings.rows[0] ?? null,
        source: source.rows[0] ?? null,
        variants: variants.rows[0] ?? null,
        integrity: integrity.rows[0] ?? null,
        channel: channel.rows[0] ?? null,
        latestRun: latestRun.rows[0] ?? null,
        grades: grades.rows[0] ?? null,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
