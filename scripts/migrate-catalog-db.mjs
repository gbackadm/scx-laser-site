import { readdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  console.error("DATABASE_URL is required to run catalog migrations.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const migrationsDir = resolve("db/migrations");
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrationFiles) {
    const migrationSql = await readFile(resolve(migrationsDir, migrationFile), "utf8");
    await pool.query(migrationSql);
    console.log(`Applied ${migrationFile}.`);
  }

  console.log("Catalog migrations applied successfully.");
} finally {
  await pool.end();
}
