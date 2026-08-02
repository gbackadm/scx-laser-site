import { randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import readline from "node:readline/promises";
import { promisify } from "node:util";
import pg from "pg";

const { Pool } = pg;
const scrypt = promisify(scryptCallback);
const roles = new Set(["owner", "manager", "seller"]);

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

async function hashPassword(password) {
  const salt = randomBytes(16);
  const options = {
    N: 131_072,
    r: 8,
    p: 1,
    maxmem: 160 * 1024 * 1024,
  };
  const key = await scrypt(password, salt, 64, options);

  return [
    "scrypt",
    options.N,
    options.r,
    options.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function promptHidden(question) {
  process.stdout.write(question);

  const input = process.stdin;
  const wasRaw = input.isRaw;
  input.setRawMode?.(true);
  input.resume();

  let value = "";

  return await new Promise((resolve) => {
    const onData = (buffer) => {
      const char = buffer.toString("utf8");

      if (char === "\u0003") {
        process.stdout.write("\n");
        process.exit(130);
      }

      if (char === "\r" || char === "\n") {
        input.off("data", onData);
        input.setRawMode?.(wasRaw ?? false);
        process.stdout.write("\n");
        resolve(value);
        return;
      }

      if (char === "\b" || char === "\u007f") {
        value = value.slice(0, -1);
        return;
      }

      value += char;
    };

    input.on("data", onData);
  });
}

loadLocalDatabaseUrl();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to create an admin user.");
  process.exit(1);
}

const rl = createPrompt();

try {
  const name = (await rl.question("Nome do usuario: ")).trim();
  const email = (await rl.question("E-mail: ")).trim().toLowerCase();
  const role = (await rl.question("Papel (owner, manager, seller): ")).trim();
  rl.close();

  if (!name || !email || !roles.has(role)) {
    console.error("Nome, e-mail e papel valido sao obrigatorios.");
    process.exit(1);
  }

  const password = await promptHidden("Senha (minimo 12 caracteres): ");
  const confirmation = await promptHidden("Confirme a senha: ");

  if (password.length < 12) {
    console.error("A senha precisa ter pelo menos 12 caracteres.");
    process.exit(1);
  }

  if (password !== confirmation) {
    console.error("As senhas nao conferem.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  try {
    const existing = await pool.query(
      "SELECT id FROM scx_catalog_admin_users WHERE lower(email) = $1 LIMIT 1",
      [email],
    );

    if (existing.rowCount > 0) {
      console.error("Ja existe um usuario administrativo com esse e-mail.");
      process.exit(1);
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);

    await pool.query("BEGIN");
    await pool.query(
      `
        INSERT INTO scx_catalog_admin_users (
          id,
          name,
          email,
          role,
          is_active,
          password_hash,
          password_updated_at
        )
        VALUES ($1, $2, $3, $4, true, $5, now())
      `,
      [userId, name, email, role, passwordHash],
    );
    await pool.query(
      `
        INSERT INTO scx_catalog_audit_log (
          id,
          actor_user_id,
          action,
          entity_type,
          entity_id,
          summary
        )
        VALUES ($1, $2, 'admin_user_created', 'user', $2, $3)
      `,
      [randomUUID(), userId, `Usuario administrativo ${email} criado.`],
    );
    await pool.query("COMMIT");

    console.log(`Usuario administrativo criado: ${email} (${role}).`);
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await pool.end();
  }
} finally {
  rl.close();
}
