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

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  const { rows } = await pool.query(`
    SELECT DISTINCT activity.pid
    FROM pg_locks lock
    INNER JOIN pg_stat_activity activity ON activity.pid = lock.pid
    WHERE lock.locktype = 'advisory'
      AND lock.objid = hashtext('scx-olist-scheduled-sync')::oid
      AND activity.pid <> pg_backend_pid()
  `);
  const terminated = [];

  for (const row of rows) {
    const result = await pool.query(
      `SELECT pg_terminate_backend($1) AS terminated`,
      [row.pid],
    );
    if (result.rows[0]?.terminated) {
      terminated.push(row.pid);
    }
  }

  console.log(JSON.stringify({ found: rows.length, terminated }, null, 2));
} finally {
  await pool.end();
}
