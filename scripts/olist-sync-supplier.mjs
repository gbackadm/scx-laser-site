import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

function loadLocalEnv() {
  if (!existsSync(".env.local")) {
    return;
  }

  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([^#][^=]+)=(.+)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function postTinyApi(path, params) {
  const response = await fetch(`https://api.tiny.com.br/api2/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });

  return response.json();
}

function getRecords(result, key) {
  const items = result?.retorno?.[key] ?? [];
  return Array.isArray(items) ? items : [items];
}

loadLocalEnv();

const supplierId = getArg("--supplier-id") ?? "asia-import";
const supplierName = getArg("--supplier-name") ?? "Asia Import";
const supplierCode = getArg("--supplier-code") ?? supplierId;
const token = process.env.OLIST_API_TOKEN ?? process.env.TINY_API_TOKEN;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!token) {
  console.error("OLIST_API_TOKEN or TINY_API_TOKEN is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const search = await postTinyApi("contatos.pesquisa.php", {
    token,
    pesquisa: supplierName,
    formato: "JSON",
  });

  let contact = getRecords(search, "contatos")
    .map((entry) => entry?.contato)
    .find(
      (entry) =>
        entry?.nome === supplierName ||
        entry?.fantasia === supplierName ||
        String(entry?.codigo ?? "") === supplierCode,
    );

  if (!contact) {
    const create = await postTinyApi("contato.incluir.php", {
      token,
      contato: JSON.stringify({
        contatos: [
          {
            contato: {
              sequencia: "1",
              codigo: supplierCode,
              nome: supplierName,
              fantasia: supplierName,
              tipo_pessoa: "E",
              situacao: "A",
              tipos_contato: [{ tipo: "Fornecedor" }],
              obs: "Fornecedor sincronizado pelo Sistema SCX.",
            },
          },
        ],
      }),
      formato: "JSON",
    });

    const created = getRecords(create, "registros")[0]?.registro;
    if (!created?.id) {
      console.error("Could not create supplier contact.");
      console.error(JSON.stringify(create, null, 2));
      process.exit(1);
    }

    contact = {
      id: created.id,
      codigo: supplierCode,
      nome: supplierName,
    };
  }

  await pool.query(
    `
      INSERT INTO scx_catalog_supplier_channel_mappings (
        id,
        supplier_id,
        supplier_name,
        channel,
        external_id,
        external_code,
        external_name,
        last_synced_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'olist', $4, $5, $6, now(), now())
      ON CONFLICT (supplier_id, channel)
      DO UPDATE SET
        supplier_name = EXCLUDED.supplier_name,
        external_id = EXCLUDED.external_id,
        external_code = EXCLUDED.external_code,
        external_name = EXCLUDED.external_name,
        last_synced_at = now(),
        updated_at = now()
    `,
    [
      `supplier-channel-${supplierId}-olist`,
      supplierId,
      supplierName,
      String(contact.id),
      String(contact.codigo ?? supplierCode),
      String(contact.nome ?? supplierName),
    ],
  );

  console.log("Supplier synced:");
  console.log(
    JSON.stringify(
      {
        supplierId,
        supplierName,
        olistContactId: String(contact.id),
        olistCode: String(contact.codigo ?? supplierCode),
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
