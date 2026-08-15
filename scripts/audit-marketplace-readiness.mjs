import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  const match = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m);
  if (match) process.env.DATABASE_URL = match[1].trim();
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nao configurada.");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const includeDetails = process.argv.includes("--details");

try {
  const result = await pool.query(`
    SELECT
      category.name AS category,
      count(DISTINCT product.id)::int AS products,
      count(DISTINCT variant.id)::int AS variants,
      count(DISTINCT product.id) FILTER (
        WHERE NULLIF(btrim(supplier.raw_payload->'propriedades'->>'quant-por-caixa'), '') IS NOT NULL
      )::int AS with_master_quantity,
      count(DISTINCT product.id) FILTER (
        WHERE NULLIF(btrim(supplier.raw_payload->'propriedades'->>'dimensao-caixa'), '') IS NOT NULL
      )::int AS with_master_dimensions,
      count(DISTINCT product.id) FILTER (
        WHERE NULLIF(btrim(COALESCE(supplier.raw_payload->'propriedades'->>'peso-da-caixa', supplier.raw_payload->'propriedades'->>'peso-caixa')), '') IS NOT NULL
      )::int AS with_master_weight,
      count(DISTINCT product.id) FILTER (
        WHERE NULLIF(btrim(supplier.raw_payload->'propriedades'->>'quant-por-caixinha'), '') IS NOT NULL
      )::int AS with_inner_quantity,
      count(DISTINCT product.id) FILTER (
        WHERE product.stock_quantity >= pricing.publication_stock_min_quantity
      )::int AS with_publishable_stock,
      jsonb_agg(DISTINCT jsonb_build_object(
        'id', product.id,
        'sku', product.scx_sku,
        'title', product.title,
        'stock', product.stock_quantity,
        'supplierCode', supplier.external_id
      )) AS examples
    FROM scx_catalog_products product
    INNER JOIN scx_catalog_categories category ON category.id = product.category_id
    INNER JOIN scx_catalog_product_variants variant ON variant.product_id = product.id AND variant.is_active = true
    LEFT JOIN scx_catalog_supplier_products supplier ON supplier.id = product.supplier_product_id
    CROSS JOIN LATERAL (
      SELECT publication_stock_min_quantity
      FROM scx_catalog_pricing_rules
      WHERE scope = 'global' AND is_active = true
      ORDER BY updated_at DESC
      LIMIT 1
    ) pricing
    GROUP BY category.name
    ORDER BY products DESC, category.name
  `);

  const categories = result.rows.map((row) => ({
    category: row.category,
    products: row.products,
    variants: row.variants,
    logistics: {
      masterQuantity: row.with_master_quantity,
      masterDimensions: row.with_master_dimensions,
      masterWeight: row.with_master_weight,
      innerQuantity: row.with_inner_quantity,
    },
    withPublishableStock: row.with_publishable_stock,
    examples: (row.examples ?? []).slice(0, 4),
  }));

  const totals = categories.reduce((summary, category) => ({
    products: summary.products + category.products,
    variants: summary.variants + category.variants,
    withPublishableStock: summary.withPublishableStock + category.withPublishableStock,
  }), { products: 0, variants: 0, withPublishableStock: 0 });
  const summary = categories.map(({ examples, ...category }) => includeDetails ? { ...category, examples } : category);
  console.log(JSON.stringify({ totals, categories: summary }, null, 2));
} finally {
  await pool.end();
}
