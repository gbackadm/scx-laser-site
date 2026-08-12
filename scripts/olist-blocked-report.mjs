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

function normalizeDecimal(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = String(value)
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function firstPositiveNumber(values) {
  for (const value of values) {
    const normalized = normalizeDecimal(value);
    if (Number.isFinite(normalized) && normalized > 0) {
      return normalized;
    }
  }

  return undefined;
}

function attributeValue(rawPayload, slugs) {
  const properties = rawPayload?.propriedades ?? {};
  for (const slug of slugs) {
    if (properties[slug]) {
      return properties[slug];
    }
  }

  const properties2 = Array.isArray(rawPayload?.propriedades2) ? rawPayload.propriedades2 : [];
  for (const entry of properties2) {
    if (slugs.includes(entry?.slug)) {
      return entry.value;
    }
  }

  return undefined;
}

function parseDimensions(rawPayload) {
  const value = String(
    attributeValue(rawPayload, [
      "medidas-do-produto",
      "medida-do-produto",
      "dimensao-do-produto",
      "dimensao-produto",
      "dimensoes-do-produto",
      "dimensoes-produto",
      "dimensao-da-embalagem",
      "medidas",
      "dimensao",
    ]) ?? "",
  );
  const numbers = value.match(/\d+(?:[,.]\d+)?/g)?.map(normalizeDecimal) ?? [];
  const diameterMatch = value.match(/[Ã¸øo]\s*([\d,.]+)/i);
  const usesDiameter = Boolean(diameterMatch) || /øD|diam/i.test(value);
  const diameter = usesDiameter ? normalizeDecimal(diameterMatch?.[1]) ?? numbers[1] : undefined;

  return {
    raw: value,
    height: firstPositiveNumber([numbers[0], rawPayload?.altura]),
    width: firstPositiveNumber([usesDiameter ? diameter : numbers[1], rawPayload?.largura]),
    length: firstPositiveNumber([usesDiameter ? diameter : numbers[2], rawPayload?.comprimento]),
    diameter: firstPositiveNumber([diameter]),
  };
}

function parseWeight(rawPayload) {
  return firstPositiveNumber([
    attributeValue(rawPayload, ["peso-do-produto", "peso-produto", "peso"]),
    rawPayload?.peso,
  ]);
}

function ncm(rawPayload) {
  return attributeValue(rawPayload, ["ncm"]) ?? rawPayload?.ncm;
}

loadLocalEnv();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const { rows } = await pool.query(`
    SELECT
      p.sku,
      p.scx_sku,
      p.title,
      p.publication_status,
      sp.raw_payload,
      coalesce(images.count, 0)::int AS image_count,
      scm.external_id AS olist_supplier_id
    FROM scx_catalog_products p
    LEFT JOIN scx_catalog_supplier_products sp ON sp.id = p.supplier_product_id
    LEFT JOIN scx_catalog_supplier_channel_mappings scm
      ON scm.supplier_id = sp.supplier_id
     AND scm.channel = 'olist'
    LEFT JOIN LATERAL (
      SELECT count(*) AS count
      FROM scx_catalog_product_images i
      WHERE i.product_id = p.id
    ) images ON true
    WHERE p.publication_status IN ('published', 'hidden', 'out_of_stock')
    ORDER BY p.updated_at ASC, p.id ASC
  `);

  const blocked = rows
    .map((row) => {
      const dimensions = parseDimensions(row.raw_payload ?? {});
      const reasons = [];
      if (!ncm(row.raw_payload ?? {})) reasons.push("sem NCM");
      if (!parseWeight(row.raw_payload ?? {})) reasons.push("sem peso");
      if (!dimensions.height || !dimensions.width || !dimensions.length) {
        reasons.push("sem medidas");
      }
      if (!row.image_count) reasons.push("sem imagem");
      if (!row.olist_supplier_id) reasons.push("sem fornecedor");

      return {
        sku: row.sku,
        scx_sku: row.scx_sku,
        title: row.title,
        status: row.publication_status,
        reasons,
        ncm: ncm(row.raw_payload ?? {}),
        weight: parseWeight(row.raw_payload ?? {}),
        dimensions,
        raw_altura: row.raw_payload?.altura,
        raw_largura: row.raw_payload?.largura,
        raw_comprimento: row.raw_payload?.comprimento,
      };
    })
    .filter((row) => row.reasons.length > 0);

  console.log(JSON.stringify(blocked, null, 2));
} finally {
  await pool.end();
}
