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
      pcm.external_id,
      pcm.external_sku,
      pcm.supplier_sku,
      pcm.last_synced_at
    FROM scx_catalog_products p
    LEFT JOIN scx_catalog_product_channel_mappings pcm
      ON pcm.product_id = p.id
     AND pcm.channel = 'olist'
    WHERE p.scx_sku = 'SCX-CAN-0006'
       OR p.sku = 'CM17725B'
  `);

  console.log(JSON.stringify(rows, null, 2));
} finally {
  await pool.end();
}
