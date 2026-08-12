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

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.sku,
      p.scx_sku,
      p.title,
      p.publication_status,
      p.price_amount_in_cents,
      p.cost_amount_in_cents,
      p.stock_quantity,
      c.name AS category,
      count(i.id)::int AS image_count
    FROM scx_catalog_products p
    LEFT JOIN scx_catalog_categories c ON c.id = p.category_id
    LEFT JOIN scx_catalog_product_images i ON i.product_id = p.id
    GROUP BY p.id, c.name
    ORDER BY image_count DESC, p.updated_at DESC
    LIMIT 20
  `);

  console.table(rows);
} finally {
  await pool.end();
}
