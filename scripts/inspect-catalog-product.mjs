import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

function loadLocalEnv() {
  if (!existsSync(".env.local")) {
    return;
  }

  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([^#][^=]+)=(.+)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

loadLocalEnv();

const sku = getArg("--sku");
if (!sku) {
  console.error("Use --sku SKU_DO_PRODUTO.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const { rows } = await pool.query(
    `
      SELECT
        p.*,
        c.name AS category,
        sp.supplier_id,
        sp.supplier_name,
        sp.external_id,
        sp.raw_name,
        sp.raw_description,
        sp.raw_category,
        sp.raw_image_urls,
        sp.raw_payload,
        coalesce(
          json_agg(
            json_build_object(
              'url', i.url,
              'alt_text', i.alt_text,
              'source', i.source,
              'sort_order', i.sort_order
            )
            ORDER BY i.sort_order ASC
          ) FILTER (WHERE i.id IS NOT NULL),
          '[]'::json
        ) AS images
      FROM scx_catalog_products p
      LEFT JOIN scx_catalog_categories c ON c.id = p.category_id
      LEFT JOIN scx_catalog_supplier_products sp ON sp.id = p.supplier_product_id
      LEFT JOIN scx_catalog_product_images i ON i.product_id = p.id
      WHERE p.sku = $1
         OR p.scx_sku = $1
      GROUP BY p.id, c.name, sp.id
    `,
    [sku],
  );

  console.log(JSON.stringify(rows[0] ?? null, null, 2));
} finally {
  await pool.end();
}
