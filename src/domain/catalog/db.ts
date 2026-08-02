import "server-only";

import { Pool } from "pg";

let pool: Pool | undefined;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabasePool() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required for database access.");
  }

  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });

  return pool;
}
