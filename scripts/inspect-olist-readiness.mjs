import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

if (existsSync(".env.local")) {
  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([^#][^=]+)=(.+)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const { rows } = await pool.query(`
    SELECT
      p.sku,
      p.scx_sku,
      p.title,
      p.publication_status,
      p.stock_quantity,
      sp.raw_payload->'propriedades' AS propriedades,
      sp.raw_payload->'propriedades2' AS propriedades2,
      sp.raw_payload->>'altura' AS altura,
      sp.raw_payload->>'largura' AS largura,
      sp.raw_payload->>'comprimento' AS comprimento,
      sp.raw_payload->>'peso' AS peso,
      sp.raw_payload->>'referencia' AS referencia
    FROM scx_catalog_products p
    LEFT JOIN scx_catalog_supplier_products sp ON sp.id = p.supplier_product_id
    WHERE p.publication_status IN ('published', 'hidden', 'out_of_stock')
    ORDER BY p.updated_at ASC, p.id ASC
    LIMIT 20
  `);

  console.log(JSON.stringify(rows, null, 2));
} finally {
  await pool.end();
}
