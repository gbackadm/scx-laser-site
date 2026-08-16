import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^DATABASE_URL=(.+)$/);
    if (match) process.env.DATABASE_URL = match[1].trim();
  }
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nao configurada.");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const result = await pool.query(
    `SELECT to_regclass('public.scx_mercado_livre_listing_metrics') AS table_name,
            (SELECT count(*)::int FROM scx_mercado_livre_listing_metrics) AS cached_items,
            (SELECT max(fetched_at) FROM scx_mercado_livre_listing_metrics) AS last_fetch`,
  );
  const row = result.rows[0];
  if (!row?.table_name) throw new Error("Tabela de metricas nao encontrada.");
  console.log(`Cache de metricas pronto: ${row.cached_items} anuncio(s), ultima leitura ${row.last_fetch ?? "ainda nao executada"}.`);
} finally {
  await pool.end();
}
