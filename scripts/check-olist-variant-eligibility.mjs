import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

import { summarizeOlistPlan } from "../src/domain/olist/core.js";

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
  const [productsResult, ruleResult, settingsResult] = await Promise.all([
    pool.query(`
      SELECT
        product.id,
        product.sku,
        product.scx_sku,
        product.title,
        product.description,
        product.publication_status,
        product.price_amount_in_cents,
        product.cost_amount_in_cents,
        product.stock_quantity,
        category.name AS category,
        supplier.supplier_name,
        supplier.supplier_id,
        supplier.external_id,
        supplier.raw_payload,
        supplier_mapping.external_id AS olist_supplier_id,
        product_mapping.external_id AS olist_product_id,
        coalesce(images.items, '[]'::json) AS images,
        coalesce(variants.items, '[]'::json) AS variants,
        '[]'::json AS components,
        '[]'::json AS production_steps
      FROM scx_catalog_products product
      LEFT JOIN scx_catalog_categories category ON category.id = product.category_id
      LEFT JOIN scx_catalog_supplier_products supplier
        ON supplier.id = product.supplier_product_id
      LEFT JOIN scx_catalog_supplier_channel_mappings supplier_mapping
        ON supplier_mapping.supplier_id = supplier.supplier_id
       AND supplier_mapping.channel = 'olist'
      LEFT JOIN scx_catalog_product_channel_mappings product_mapping
        ON product_mapping.product_id = product.id
       AND product_mapping.channel = 'olist'
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('url', image.url)) AS items
        FROM scx_catalog_product_images image
        WHERE image.product_id = product.id
      ) images ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', variant.id,
            'scx_sku', variant.scx_sku,
            'supplier_sku', variant.supplier_sku,
            'name', variant.name,
            'price_amount_in_cents', variant.price_amount_in_cents,
            'cost_amount_in_cents', variant.cost_amount_in_cents,
            'stock_quantity', variant.stock_quantity,
            'attributes', variant.attributes,
            'is_active', variant.is_active,
            'olist_variant_id', variant_mapping.external_id
          )
          ORDER BY variant.sort_order, variant.id
        ) AS items
        FROM scx_catalog_product_variants variant
        LEFT JOIN scx_catalog_product_variant_channel_mappings variant_mapping
          ON variant_mapping.variant_id = variant.id
         AND variant_mapping.channel = 'olist'
        WHERE variant.product_id = product.id
      ) variants ON true
      WHERE product.publication_status IN ('published', 'hidden', 'out_of_stock')
      ORDER BY product.id
    `),
    pool.query(`
      SELECT COALESCE(publication_stock_min_quantity, 1000)::int AS min_quantity
      FROM scx_catalog_pricing_rules
      WHERE scope = 'global' AND is_active = true
      ORDER BY updated_at DESC
      LIMIT 1
    `),
    pool.query(`
      SELECT batch_size
      FROM scx_olist_sync_settings
      WHERE id = 'default'
    `),
  ]);
  const plan = summarizeOlistPlan(
    productsResult.rows,
    ruleResult.rows[0]?.min_quantity ?? 1000,
    settingsResult.rows[0]?.batch_size ?? 20,
  );

  console.log(
    JSON.stringify(
      {
        selectedProducts: plan.selectedProducts,
        eligibleProducts: plan.eligibleProducts,
        blockedProducts: plan.blockedProducts,
        blockedByReason: plan.blockedByReason,
        creates: plan.creates,
        updates: plan.updates,
        willBeActive: plan.willBeActive,
        willBeInactive: plan.willBeInactive,
        estimatedApiCalls: plan.estimatedApiCalls,
        totalVariants: productsResult.rows.reduce(
          (total, product) => total + (product.variants?.length ?? 0),
          0,
        ),
        blockedSamples: plan.blockedProductsList.slice(0, 10).map((entry) => ({
          id: entry.product.id,
          scxSku: entry.product.scx_sku,
          reasons: entry.reasons,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
