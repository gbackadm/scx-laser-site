import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

import { buildMarketplaceTitle } from "../src/domain/catalog/marketplaceTitles.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  const match = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m);
  if (match) process.env.DATABASE_URL = match[1].trim();
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL nao configurada.");
}

const shouldApply = process.argv.includes("--apply");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  const result = await pool.query(`
    SELECT id, title, scx_sku, sku
    FROM scx_catalog_products
    ORDER BY title ASC
  `);
  const changes = result.rows.flatMap((product) => {
    const nextTitle = buildMarketplaceTitle(product.title, "mercado_livre", {
      identifiers: [product.scx_sku, product.sku],
    });

    return nextTitle && nextTitle !== product.title
      ? [{ ...product, next_title: nextTitle }]
      : [];
  });

  console.log(JSON.stringify({ total: result.rowCount, changes: changes.length }, null, 2));
  for (const product of changes) {
    console.log(`${product.scx_sku ?? product.sku}: ${product.title} -> ${product.next_title}`);
  }

  if (!shouldApply || changes.length === 0) {
    if (!shouldApply) console.log("Simulacao concluida. Use --apply para gravar.");
    process.exitCode = 0;
  } else {
    await pool.query("BEGIN");
    try {
      for (const product of changes) {
        await pool.query(
          `UPDATE scx_catalog_products SET title = $2, updated_at = now() WHERE id = $1`,
          [product.id, product.next_title],
        );
        await pool.query(
          `UPDATE scx_catalog_product_images SET alt_text = $2 WHERE product_id = $1`,
          [product.id, product.next_title],
        );
      }
      await pool.query("COMMIT");
      console.log(`Titulos atualizados: ${changes.length}`);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await pool.end();
}
