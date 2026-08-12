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

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function detectScope(slug) {
  if (["ncm", "cest", "gtin", "origem"].includes(slug)) {
    return "fiscal";
  }

  if (
    slug.includes("peso") ||
    slug.includes("dimensao") ||
    slug.includes("medidas") ||
    slug.includes("embalagem") ||
    slug.includes("caixa")
  ) {
    return "logistics";
  }

  return "technical";
}

function buildAttributes(product) {
  const rawPayload = product.raw_payload ?? {};
  const attributes = [];
  let sortOrder = 0;

  for (const entry of rawPayload.propriedades2 ?? []) {
    if (!entry?.name || !entry?.value) {
      continue;
    }

    const slug = slugify(entry.slug ?? entry.name);
    attributes.push({
      scope: detectScope(slug),
      name: entry.name,
      slug,
      value: String(entry.value),
      source: "supplier",
      sortOrder: sortOrder++,
      rawPayload: entry,
    });
  }

  const colors = Array.from(
    new Set(
      (rawPayload.variacoes ?? [])
        .map((variation) => variation?.atributos?.cor?.value)
        .filter(Boolean),
    ),
  );

  if (colors.length > 0) {
    attributes.push({
      scope: "variation",
      name: "Cores disponíveis",
      slug: "cores-disponiveis",
      value: colors.join(", "),
      source: "supplier",
      sortOrder: sortOrder++,
      rawPayload: rawPayload.variacoes,
    });
  }

  const supplierCategories = Object.values(rawPayload.categorias ?? {}).filter(Boolean);
  if (supplierCategories.length > 0) {
    attributes.push({
      scope: "supplier",
      name: "Categorias do fornecedor",
      slug: "categorias-do-fornecedor",
      value: supplierCategories.join(" > "),
      source: "supplier",
      sortOrder: sortOrder++,
      rawPayload: rawPayload.categorias,
    });
  }

  if (rawPayload.video) {
    attributes.push({
      scope: "commercial",
      name: "Vídeo",
      slug: "video",
      value: String(rawPayload.video),
      source: "supplier",
      sortOrder: sortOrder++,
      rawPayload: { video: rawPayload.video },
    });
  }

  return attributes;
}

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sku = getArg("--sku");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const { rows: products } = await pool.query(
    `
      SELECT p.id, p.sku, sp.raw_payload
      FROM scx_catalog_products p
      JOIN scx_catalog_supplier_products sp ON sp.id = p.supplier_product_id
      WHERE ($1::text IS NULL OR p.sku = $1)
        AND sp.raw_payload IS NOT NULL
      ORDER BY p.sku
    `,
    [sku ?? null],
  );

  let upserted = 0;
  for (const product of products) {
    const attributes = buildAttributes(product);
    for (const attribute of attributes) {
      await pool.query(
        `
          INSERT INTO scx_catalog_product_attributes (
            id,
            product_id,
            scope,
            name,
            slug,
            value,
            source,
            sort_order,
            raw_payload,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
          ON CONFLICT (product_id, scope, slug)
          DO UPDATE SET
            name = EXCLUDED.name,
            value = EXCLUDED.value,
            source = EXCLUDED.source,
            sort_order = EXCLUDED.sort_order,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = now()
        `,
        [
          `attr-${product.id}-${attribute.scope}-${attribute.slug}`,
          product.id,
          attribute.scope,
          attribute.name,
          attribute.slug,
          attribute.value,
          attribute.source,
          attribute.sortOrder,
          JSON.stringify(attribute.rawPayload),
        ],
      );
      upserted += 1;
    }
  }

  console.log(`Products processed: ${products.length}`);
  console.log(`Attributes upserted: ${upserted}`);
} finally {
  await pool.end();
}
