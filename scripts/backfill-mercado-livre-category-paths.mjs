import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";

import { decryptSecret } from "../src/domain/mercadoLivre/core.js";

const { Pool } = pg;

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nao configurada.");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

try {
  const [accountResult, settingsResult] = await Promise.all([
    pool.query(`SELECT encrypted_access_token FROM scx_mercado_livre_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1`),
    pool.query(`SELECT DISTINCT category_id FROM scx_mercado_livre_product_settings WHERE category_path='[]'::jsonb`),
  ]);
  if (!accountResult.rows[0]) throw new Error("Conta Mercado Livre ativa nao encontrada.");
  const token = decryptSecret(accountResult.rows[0].encrypted_access_token, process.env.MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY);
  let updated = 0;

  for (const row of settingsResult.rows) {
    const response = await fetch(`https://api.mercadolibre.com/categories/${row.category_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const category = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Falha ao consultar a categoria ${row.category_id}.`);
    const path = (category?.path_from_root ?? []).flatMap((item) => item?.name ? [String(item.name)] : []);
    if (!path.length) continue;
    const result = await pool.query(
      `UPDATE scx_mercado_livre_product_settings SET category_path=$2::jsonb, updated_at=now()
       WHERE category_id=$1 AND category_path='[]'::jsonb`,
      [row.category_id, JSON.stringify(path)],
    );
    updated += result.rowCount ?? 0;
  }

  console.log(JSON.stringify({ categories: settingsResult.rowCount, productsUpdated: updated }));
} finally {
  await pool.end();
}
