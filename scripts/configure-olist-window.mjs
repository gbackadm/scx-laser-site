import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

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

const batchSize = Number(process.argv[2]);
const callsPerMinute = Number(process.argv[3]);
const dueNow = process.argv.includes("--due-now");

if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 20) {
  throw new Error("Tamanho de lote deve estar entre 1 e 20.");
}

if (!Number.isInteger(callsPerMinute) || callsPerMinute < 1 || callsPerMinute > 5) {
  throw new Error("Chamadas por minuto devem estar entre 1 e 5.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  const { rows } = await pool.query(
    `
      UPDATE scx_olist_sync_settings
      SET batch_size = $1,
        batch_calls_per_minute = $2,
        next_auto_sync_after = CASE WHEN $3 THEN now() ELSE next_auto_sync_after END,
        updated_at = now()
      WHERE id = 'default'
      RETURNING batch_size, batch_calls_per_minute, next_auto_sync_after
    `,
    [batchSize, callsPerMinute, dueNow],
  );

  console.log(JSON.stringify(rows[0] ?? null, null, 2));
} finally {
  await pool.end();
}
