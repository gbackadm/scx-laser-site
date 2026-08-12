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

function clean(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/peças|pecas|pçs/gi, "pcs")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, maxLength) {
  return clean(value).slice(0, maxLength);
}

function attributeGroupName(attribute) {
  return truncate(`SCX ${attribute.name}`, 50);
}

function attributeTagName(attribute) {
  return truncate(attribute.value, 50);
}

function toMoney(cents) {
  return (Math.max(0, cents ?? 0) / 100).toFixed(2);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(result) {
  return (
    String(result?.retorno?.codigo_erro ?? "") === "6" ||
    JSON.stringify(result).includes("Excedido o número de acessos")
  );
}

async function postTinyApi(path, params) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`https://api.tiny.com.br/api2/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    const result = await response.json();
    if (!isRateLimited(result) || attempt === 4) {
      return result;
    }

    console.log("Olist API limit reached. Waiting before retry...");
    await sleep(65000);
  }
}

function getRecords(result) {
  const records = result?.retorno?.registros ?? [];
  return Array.isArray(records) ? records : [records];
}

function findGroup(result, name) {
  return getRecords(result)
    .map((entry) => entry?.registro)
    .find((entry) => clean(entry?.grupo ?? entry?.nome ?? "") === clean(name));
}

function findTag(result, name, groupId) {
  return getRecords(result)
    .map((entry) => entry?.registro)
    .find(
      (entry) =>
        clean(entry?.nome ?? entry?.nome_tag ?? "") === clean(name) &&
        String(entry?.id_grupo ?? entry?.idGrupo ?? entry?.idGrupoTag ?? "") === String(groupId),
    );
}

async function ensureGroup(token, name) {
  const search = await postTinyApi("grupo.tag.pesquisa.php", {
    token,
    pesquisa: name,
    formato: "JSON",
  });

  const existing = findGroup(search, name);
  if (existing?.id) {
    return existing.id;
  }

  const create = await postTinyApi("grupo.tag.incluir.php", {
    token,
    grupo: JSON.stringify({
      grupos_tag: [
        {
          grupo_tag: {
            sequencia: "1",
            nome: name,
          },
        },
      ],
    }),
    formato: "JSON",
  });

  const created = getRecords(create)[0]?.registro;
  if (created?.id) {
    return created.id;
  }

  throw new Error(`Could not create/find tag group ${name}: ${JSON.stringify(create)}`);
}

async function ensureTag(token, groupId, name) {
  const search = await postTinyApi("tag.pesquisa.php", {
    token,
    idGrupo: String(groupId),
    formato: "JSON",
  });

  const existing = findTag(search, name, groupId);
  if (existing?.id) {
    return existing.id;
  }

  const create = await postTinyApi("tag.incluir.php", {
    token,
    tag: JSON.stringify({
      tags: [
        {
          tag: {
            sequencia: "1",
            nome: name,
            id_grupo: String(groupId),
          },
        },
      ],
    }),
    formato: "JSON",
  });

  const created = getRecords(create)[0]?.registro;
  if (created?.id) {
    return created.id;
  }

  throw new Error(`Could not create/find tag ${name}: ${JSON.stringify(create)}`);
}

loadLocalEnv();

const sku = getArg("--sku") ?? process.env.OLIST_TEST_SKU;
const execute = process.argv.includes("--execute");
const token = process.env.OLIST_API_TOKEN ?? process.env.TINY_API_TOKEN;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!token) {
  console.error("OLIST_API_TOKEN or TINY_API_TOKEN is required.");
  process.exit(1);
}

if (!sku) {
  console.error("Use --sku SKU_DO_PRODUTO or set OLIST_TEST_SKU.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const { rows: products } = await pool.query(
    `
      SELECT
        p.id,
        p.sku,
        p.scx_sku,
        p.title,
        p.description,
        p.price_amount_in_cents,
        p.cost_amount_in_cents,
        p.stock_quantity,
        c.name AS category,
        sp.raw_payload
      FROM scx_catalog_products p
      LEFT JOIN scx_catalog_categories c ON c.id = p.category_id
      LEFT JOIN scx_catalog_supplier_products sp ON sp.id = p.supplier_product_id
      WHERE p.sku = $1
         OR p.scx_sku = $1
    `,
    [sku],
  );
  const product = products[0];
  if (!product) {
    console.error(`Product not found for SKU ${sku}.`);
    process.exit(1);
  }

  const { rows: attributes } = await pool.query(
    `
      SELECT scope, name, slug, value, sort_order
      FROM scx_catalog_product_attributes
      WHERE product_id = $1
        AND is_channel_attribute = true
      ORDER BY scope, sort_order
    `,
    [product.id],
  );

  const prepared = attributes.map((attribute) => ({
    group: attributeGroupName(attribute),
    tag: attributeTagName(attribute),
  }));

  console.log("Prepared Olist tag attributes:");
  console.log(JSON.stringify(prepared, null, 2));

  if (!execute) {
    console.log("Dry run only. Re-run with --execute to create Olist tag groups/tags.");
    process.exit(0);
  }

  const tagIds = [];
  for (const attribute of attributes) {
    const groupName = attributeGroupName(attribute);
    const tagName = attributeTagName(attribute);
    const groupId = await ensureGroup(token, groupName);
    await sleep(1200);
    const tagId = await ensureTag(token, groupId, tagName);
    tagIds.push(String(tagId));
    await sleep(1200);
  }

  console.log("Synced Olist tag IDs:");
  console.log(JSON.stringify(tagIds, null, 2));

  const searchResult = await postTinyApi("produtos.pesquisa.php", {
    token,
    pesquisa: product.scx_sku ?? product.sku,
    formato: "JSON",
  });

  const exactMatch = (searchResult?.retorno?.produtos ?? []).find(
    (entry) => entry?.produto?.codigo === (product.scx_sku ?? product.sku),
  );
  if (!exactMatch?.produto?.id) {
    throw new Error(`Olist product not found for SKU ${product.scx_sku ?? product.sku}.`);
  }

  const rawPayload = product.raw_payload ?? {};
  const ncm = rawPayload?.propriedades?.ncm;
  const costInCents = product.cost_amount_in_cents ?? product.price_amount_in_cents;
  const updateResult = await postTinyApi("produto.alterar.php", {
    token,
    produto: JSON.stringify({
      produtos: [
        {
          produto: {
            sequencia: "1",
            id: String(exactMatch.produto.id),
            codigo: product.scx_sku ?? product.sku,
            nome: product.title,
            unidade: "UN",
            preco: toMoney(Math.round(costInCents * 2.2)),
            preco_custo: toMoney(costInCents),
            ncm,
            origem: process.env.OLIST_DEFAULT_ORIGIN ?? "2",
            situacao: "I",
            tipo: "P",
            classe_produto: "S",
            categoria: product.category,
            descricao_complementar: product.description,
            estoque_atual: product.stock_quantity,
            tags: tagIds,
          },
        },
      ],
    }),
    formato: "JSON",
  });

  console.log("Attach attributes to product result:");
  console.log(JSON.stringify(updateResult, null, 2));
} finally {
  await pool.end();
}
