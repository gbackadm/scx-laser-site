import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";

import { decryptSecret } from "../src/domain/mercadoLivre/core.js";
import { inferMaterial } from "../src/domain/mercadoLivre/genericPublishingCore.js";
import { confirmedMasterPack, confirmedUnitPack } from "../src/domain/mercadoLivre/packageSource.js";

const { Pool } = pg;
const STANDARD_PACKS = [10, 50, 100, 500, 1000];

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nao configurada.");

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function requiredAttribute(attribute) {
  return Boolean(attribute?.tags?.required || attribute?.tags?.new_required);
}

function valueForAttribute(attribute, product) {
  const id = String(attribute.id ?? "");
  const aliases = [id, attribute.name].map(normalized).filter(Boolean);
  const sourceAttributes = Array.isArray(product.channel_attributes) ? product.channel_attributes : [];
  const matched = sourceAttributes.find((item) => {
    const names = [item.name, item.slug].map(normalized);
    return aliases.some((alias) => names.includes(alias));
  });
  if (matched?.value) return { source: "catalog", value: String(matched.value) };
  if (id === "BRAND") return { source: "default", value: "SCX Laser" };
  if (id === "MODEL") return { source: "supplier", value: String(product.external_id ?? product.sku) };
  if (id === "MATERIALS") {
    const material = inferMaterial(product.title, product.description);
    if (material) return { source: "inferred", value: material };
  }
  if (["COLOR", "EXTERIOR_COLOR", "INK_COLOR"].includes(id)) {
    const color = product.variant_attributes?.Cor ?? product.variant_attributes?.cor;
    if (color) return { source: "variant", value: String(color) };
  }
  return null;
}

async function mlJson(token, path) {
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Mercado Livre ${response.status} em ${path}`);
  return body;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

try {
  const [accountResult, samplesResult] = await Promise.all([
    pool.query(`SELECT encrypted_access_token FROM scx_mercado_livre_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1`),
    pool.query(`
      WITH candidates AS (
        SELECT
          product.id,
          product.sku,
          product.scx_sku,
          product.title,
          product.description,
          product.stock_quantity,
          supplier.raw_payload,
          supplier.external_id,
          category.name AS catalog_category,
          settings.category_id AS override_category_id,
          settings.category_name AS override_category_name,
          settings.domain_id AS override_domain_id,
          profile.category_id AS profile_category_id,
          profile.domain_id AS profile_domain_id,
          profile.status AS profile_status,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('name', attribute.name, 'slug', attribute.slug, 'value', attribute.value) ORDER BY attribute.sort_order, attribute.id)
            FROM scx_catalog_product_attributes attribute
            WHERE attribute.product_id=product.id AND attribute.is_channel_attribute=true
          ), '[]'::jsonb) AS channel_attributes,
          COALESCE((
            SELECT variant.attributes
            FROM scx_catalog_product_variants variant
            WHERE variant.product_id=product.id AND variant.is_active=true
            ORDER BY variant.stock_quantity DESC, variant.sort_order, variant.id
            LIMIT 1
          ), '{}'::jsonb) AS variant_attributes,
          (SELECT count(*) FROM scx_catalog_product_images image WHERE image.product_id=product.id)::int AS product_images,
          (SELECT count(*) FROM scx_catalog_product_variants variant WHERE variant.product_id=product.id AND variant.is_active=true)::int AS variants,
          row_number() OVER (
            PARTITION BY category.id
            ORDER BY
              (CASE WHEN settings.category_id IS NOT NULL THEN 3 WHEN profile.status='reviewed' THEN 2 ELSE 0 END) DESC,
              (CASE WHEN product.stock_quantity >= 1000 THEN 1 ELSE 0 END) DESC,
              (CASE WHEN product.description IS NOT NULL AND length(btrim(product.description)) >= 40 THEN 1 ELSE 0 END) DESC,
              product.stock_quantity DESC,
              product.id
          ) AS position
        FROM scx_catalog_products product
        INNER JOIN scx_catalog_categories category ON category.id=product.category_id
        INNER JOIN scx_catalog_supplier_products supplier ON supplier.id=product.supplier_product_id
        LEFT JOIN scx_mercado_livre_product_settings settings ON settings.product_id=product.id
        LEFT JOIN scx_mercado_livre_category_profiles profile ON profile.catalog_category_id=product.category_id
      )
      SELECT * FROM candidates WHERE position=1 ORDER BY catalog_category
    `),
  ]);
  if (!accountResult.rows[0]) throw new Error("Conta Mercado Livre ativa nao encontrada.");
  const token = decryptSecret(accountResult.rows[0].encrypted_access_token, process.env.MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY);
  const results = [];

  for (const product of samplesResult.rows) {
    const configuredCategoryId = product.override_category_id
      ?? (product.profile_status === "reviewed" ? product.profile_category_id : null);
    let categoryId = configuredCategoryId;
    let categoryName = product.override_category_name ?? null;
    let domainId = product.override_domain_id
      ?? (product.profile_status === "reviewed" ? product.profile_domain_id : null);
    let categorySource = product.override_category_id ? "product" : configuredCategoryId ? "reviewed-profile" : "prediction";
    const query = String(product.title).replace(/^SCX-[A-Z]+-\d+\s*[-:]?\s*/i, "").slice(0, 120);

    if (!categoryId) {
      const predictions = await mlJson(token, `/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(query)}`);
      const prediction = Array.isArray(predictions) ? predictions[0] : null;
      categoryId = prediction?.category_id ?? null;
      categoryName = prediction?.category_name ?? null;
      domainId = prediction?.domain_id ?? null;
    }

    if (!categoryId) {
      results.push({ catalogCategory: product.catalog_category, sku: product.scx_sku, title: product.title, status: "category-missing" });
      continue;
    }

    const attributes = await mlJson(token, `/categories/${categoryId}/attributes`);
    const missingRequired = attributes
      .filter(requiredAttribute)
      .filter((attribute) => !valueForAttribute(attribute, product))
      .map((attribute) => ({ id: attribute.id, name: attribute.name }));
    const inferred = attributes
      .filter(requiredAttribute)
      .map((attribute) => ({ attribute, value: valueForAttribute(attribute, product) }))
      .filter((item) => item.value)
      .map((item) => ({ id: item.attribute.id, value: item.value.value, source: item.value.source }));
    const master = confirmedMasterPack(product.raw_payload);
    const unit = confirmedUnitPack(product.raw_payload);
    const feasiblePacks = STANDARD_PACKS.filter((quantity) => Number(product.stock_quantity) >= quantity);
    const logisticsComplete = master.masterUnits > 0
      && master.lengthCm > 0 && master.widthCm > 0 && master.heightCm > 0 && master.weightGrams > 0;
    const status = categorySource === "prediction"
      ? "category-review"
      : missingRequired.length
        ? "attributes-missing"
        : feasiblePacks.length && Number(product.product_images) >= 2
          ? "ready-for-official-validation"
          : "source-data-missing";

    results.push({
      catalogCategory: product.catalog_category,
      sku: product.scx_sku,
      title: product.title,
      status,
      mercadoLivre: { categoryId, categoryName, domainId, source: categorySource },
      source: {
        stock: Number(product.stock_quantity),
        variants: Number(product.variants),
        productImages: Number(product.product_images),
        feasiblePacks,
        logistics: { masterComplete: logisticsComplete, master, unit },
      },
      requiredAttributes: { inferred, missing: missingRequired },
    });
  }

  const summary = results.reduce((accumulator, item) => {
    accumulator[item.status] = (accumulator[item.status] ?? 0) + 1;
    return accumulator;
  }, {});
  console.log(JSON.stringify({ auditedAt: new Date().toISOString(), total: results.length, summary, results }, null, 2));
  if (results.some((item) => item.status === "category-missing")) process.exitCode = 1;
} finally {
  await pool.end();
}
