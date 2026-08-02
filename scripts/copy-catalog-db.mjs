import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const catalogTables = [
  "scx_catalog_categories",
  "scx_catalog_supplier_products",
  "scx_catalog_products",
  "scx_catalog_product_images",
  "scx_catalog_admin_users",
  "scx_catalog_sync_runs",
  "scx_catalog_audit_log",
  "scx_catalog_pricing_rules",
  "scx_catalog_pricing_batch_tiers",
];

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.+)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim()]),
  );
}

function getSourceDatabaseUrl() {
  const localEnv = loadEnvFile(".env.local");
  return process.env.SOURCE_DATABASE_URL ?? localEnv.DATABASE_URL;
}

function getTargetDatabaseUrl() {
  return process.env.TARGET_DATABASE_URL ?? process.env.PRODUCTION_DATABASE_URL;
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function buildInsert(tableName, rows) {
  if (rows.length === 0) {
    return null;
  }

  const columns = Object.keys(rows[0]);
  const values = [];
  const rowPlaceholders = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column]);
      return `$${values.length}`;
    });

    return `(${placeholders.join(", ")})`;
  });

  return {
    sql: `
      INSERT INTO ${quoteIdent(tableName)} (${columns.map(quoteIdent).join(", ")})
      VALUES ${rowPlaceholders.join(", ")}
      ON CONFLICT DO NOTHING
    `,
    values,
  };
}

async function listExistingTables(pool) {
  const result = await pool.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `,
  );

  return new Set(result.rows.map((row) => row.table_name));
}

async function copyRows(sourcePool, targetPool, tableName) {
  const result = await sourcePool.query(`SELECT * FROM ${quoteIdent(tableName)}`);
  const insert = buildInsert(tableName, result.rows);

  if (insert) {
    await targetPool.query(insert.sql, insert.values);
  }

  return result.rowCount;
}

async function copyEmpresa(sourcePool, targetPool, existingSourceTables) {
  if (!existingSourceTables.has("empresa")) {
    return 0;
  }

  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS empresa (
      id integer PRIMARY KEY,
      nome_fantasia text NOT NULL,
      razao_social text,
      cnpj text,
      telefone text,
      whatsapp text,
      email text,
      endereco text,
      numero text,
      complemento text,
      bairro text,
      cidade text,
      estado text,
      cep text,
      horario_funcionamento text,
      descricao text,
      ativo boolean NOT NULL DEFAULT true,
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now()
    )
  `);

  await targetPool.query("DELETE FROM empresa");
  return await copyRows(sourcePool, targetPool, "empresa");
}

async function main() {
  const sourceDatabaseUrl = getSourceDatabaseUrl();
  const targetDatabaseUrl = getTargetDatabaseUrl();

  if (!sourceDatabaseUrl) {
    console.error("SOURCE_DATABASE_URL ou DATABASE_URL local nao encontrado.");
    process.exit(1);
  }

  if (!targetDatabaseUrl) {
    console.error("Defina TARGET_DATABASE_URL com a URL do banco de producao.");
    process.exit(1);
  }

  if (sourceDatabaseUrl === targetDatabaseUrl) {
    console.error("Origem e destino parecem ser o mesmo banco. Operacao cancelada.");
    process.exit(1);
  }

  const sourcePool = new Pool({ connectionString: sourceDatabaseUrl, max: 1 });
  const targetPool = new Pool({ connectionString: targetDatabaseUrl, max: 1 });

  try {
    const existingSourceTables = await listExistingTables(sourcePool);
    const missingSourceTables = catalogTables.filter(
      (tableName) => !existingSourceTables.has(tableName),
    );

    if (missingSourceTables.length > 0) {
      console.error(`Tabelas ausentes na origem: ${missingSourceTables.join(", ")}`);
      process.exit(1);
    }

    await targetPool.query("BEGIN");
    await targetPool.query("SET CONSTRAINTS ALL DEFERRED");
    await targetPool.query(`
      TRUNCATE
        scx_catalog_product_images,
        scx_catalog_products,
        scx_catalog_supplier_products,
        scx_catalog_categories,
        scx_catalog_admin_sessions,
        scx_catalog_admin_users,
        scx_catalog_sync_runs,
        scx_catalog_audit_log,
        scx_catalog_pricing_batch_tiers,
        scx_catalog_pricing_rules
      RESTART IDENTITY CASCADE
    `);

    const counts = {};
    counts.empresa = await copyEmpresa(sourcePool, targetPool, existingSourceTables);

    for (const tableName of catalogTables) {
      counts[tableName] = await copyRows(sourcePool, targetPool, tableName);
    }

    await targetPool.query("DELETE FROM scx_catalog_admin_sessions");
    counts.scx_catalog_admin_sessions = 0;
    await targetPool.query("COMMIT");

    console.log("Banco de producao atualizado com sucesso.");
    for (const [tableName, count] of Object.entries(counts)) {
      console.log(`- ${tableName}: ${count}`);
    }
  } catch (error) {
    await targetPool.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

await main();
