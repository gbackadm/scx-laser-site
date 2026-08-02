import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

function loadLocalDatabaseUrl() {
  if (process.env.DATABASE_URL || !existsSync(".env.local")) {
    return;
  }

  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^DATABASE_URL=(.+)$/);
    if (match) {
      process.env.DATABASE_URL = match[1].trim();
      return;
    }
  }
}

loadLocalDatabaseUrl();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to check the catalog database.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name LIKE 'scx_catalog_%'
    ORDER BY table_name
  `);

  console.log(`Catalog tables found: ${rows.length}`);
  for (const row of rows) {
    console.log(`- ${row.table_name}`);
  }

  const countResult = await pool.query(`
    SELECT 'scx_catalog_admin_users' AS table_name, count(1)::int AS row_count
    FROM scx_catalog_admin_users
    UNION ALL
    SELECT 'scx_catalog_admin_sessions', count(1)::int
    FROM scx_catalog_admin_sessions
    UNION ALL
    SELECT 'scx_catalog_audit_log', count(1)::int
    FROM scx_catalog_audit_log
    UNION ALL
    SELECT 'scx_catalog_categories', count(1)::int
    FROM scx_catalog_categories
    UNION ALL
    SELECT 'scx_catalog_product_images', count(1)::int
    FROM scx_catalog_product_images
    UNION ALL
    SELECT 'scx_catalog_products', count(1)::int
    FROM scx_catalog_products
    UNION ALL
    SELECT 'scx_catalog_supplier_products', count(1)::int
    FROM scx_catalog_supplier_products
    UNION ALL
    SELECT 'scx_catalog_sync_runs', count(1)::int
    FROM scx_catalog_sync_runs
    ORDER BY table_name
  `);

  console.log("Catalog row counts:");
  for (const row of countResult.rows) {
    console.log(`- ${row.table_name}: ${row.row_count}`);
  }
} finally {
  await pool.end();
}
