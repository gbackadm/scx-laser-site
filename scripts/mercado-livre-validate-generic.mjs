import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";

import { decryptSecret } from "../src/domain/mercadoLivre/core.js";
import { buildGenericUserProductPayloads, deriveProfilePacks } from "../src/domain/mercadoLivre/genericPublishingCore.js";

const { Pool } = pg;

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}

const sku = process.argv[process.argv.indexOf("--sku") + 1] || "GA5100";
const includeDetails = process.argv.includes("--details");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const numberFrom = (value) => Number(String(value ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0] ?? 0);

try {
  const [account, productResult, variantsResult, imagesResult, pricingResult, tiersResult] = await Promise.all([
    pool.query(`SELECT encrypted_access_token FROM scx_mercado_livre_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1`),
    pool.query(`SELECT product.*, supplier.external_id, supplier.raw_payload, profile.*,
      product.id AS product_id, product.scx_sku AS product_scx_sku
      FROM scx_catalog_products product
      JOIN scx_catalog_supplier_products supplier ON supplier.id=product.supplier_product_id
      JOIN scx_mercado_livre_category_profiles profile ON profile.catalog_category_id=product.category_id
      WHERE product.sku=$1 OR product.scx_sku=$1 LIMIT 1`, [sku]),
    pool.query(`SELECT variant.id, variant.scx_sku, variant.cost_amount_in_cents, variant.stock_quantity, variant.attributes,
      COALESCE(array_agg(image.url ORDER BY image.sort_order, image.id) FILTER (WHERE image.id IS NOT NULL), '{}') images
      FROM scx_catalog_product_variants variant
      LEFT JOIN scx_catalog_product_variant_images image ON image.variant_id=variant.id
      JOIN scx_catalog_products product ON product.id=variant.product_id
      WHERE product.sku=$1 OR product.scx_sku=$1 GROUP BY variant.id ORDER BY variant.sort_order, variant.id`, [sku]),
    pool.query(`SELECT image.url FROM scx_catalog_product_images image JOIN scx_catalog_products product ON product.id=image.product_id
      WHERE product.sku=$1 OR product.scx_sku=$1 ORDER BY image.sort_order, image.id`, [sku]),
    pool.query(`SELECT * FROM scx_catalog_pricing_rules WHERE scope='global' AND is_active=true ORDER BY updated_at DESC LIMIT 1`),
    pool.query(`SELECT * FROM scx_catalog_pricing_batch_tiers WHERE pricing_rule_id='global-default' AND is_active=true ORDER BY min_quantity`),
  ]);
  const product = productResult.rows[0];
  if (!account.rows[0] || !product) throw new Error("Conta ou produto ausente.");
  const properties = product.raw_payload?.propriedades ?? {};
  const boxDimensions = String(properties["dimensao-caixa"] ?? "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const unitDimensions = String(properties["dimensao-produto"] ?? "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const masterUnits = Math.round(numberFrom(properties["quant-por-caixa"]));
  const masterPack = {
    unitsPerPack: masterUnits,
    lengthCm: boxDimensions[0] ?? 0,
    widthCm: boxDimensions[1] ?? 0,
    heightCm: boxDimensions[2] ?? 0,
    weightGrams: Math.round(numberFrom(properties["peso-da-caixa"] ?? properties["peso-caixa"]) * 1000),
  };
  const unit = {
    heightCm: unitDimensions[0] ?? numberFrom(product.raw_payload?.altura),
    widthCm: unitDimensions.length >= 3 ? unitDimensions[1] : unitDimensions[1] ?? numberFrom(product.raw_payload?.largura),
    lengthCm: unitDimensions.length >= 3 ? unitDimensions[2] : unitDimensions[1] ?? numberFrom(product.raw_payload?.comprimento),
    weightGrams: Math.round(numberFrom(properties["peso-do-produto"] ?? product.raw_payload?.peso) * 1000),
  };
  const packResult = deriveProfilePacks({ desiredQuantities: [...new Set([...(product.pack_quantities ?? []).map(Number), masterUnits])], masterPack, unit });
  const rule = pricingResult.rows[0];
  const offerPrice = (cost, quantity) => {
    const tier = [...tiersResult.rows].filter((item) => item.min_quantity <= quantity).at(-1);
    const raw = cost * quantity * Number(rule.cost_multiplier) * (1 + Number(rule.loss_percentage) / 100) + Number(rule.fixed_fee_amount_in_cents);
    const discounted = raw * (1 - Number(tier?.discount_percentage ?? 0) / 100);
    const lower = Math.floor((discounted - 90) / 100) * 100 + 90;
    return Math.round(discounted - lower <= 50 ? lower : lower + 100);
  };
  const variants = variantsResult.rows.map((row) => ({
    id: String(row.id), sku: String(row.scx_sku), stockQuantity: Number(row.stock_quantity), attributes: row.attributes ?? {}, images: (row.images ?? []).map(String),
    offerPricesInCents: Object.fromEntries(packResult.packs.map((pack) => [String(pack.unitsPerPack), offerPrice(Number(row.cost_amount_in_cents), pack.unitsPerPack)])),
  }));
  const token = decryptSecret(account.rows[0].encrypted_access_token, process.env.MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY);
  const [attributesResponse, categoryResponse] = await Promise.all([
    fetch(`https://api.mercadolibre.com/categories/${product.category_id}/attributes`, { headers: { Authorization: `Bearer ${token}` } }),
    fetch(`https://api.mercadolibre.com/categories/${product.category_id}`, { headers: { Authorization: `Bearer ${token}` } }),
  ]);
  if (!attributesResponse.ok || !categoryResponse.ok) throw new Error("Nao foi possivel consultar as regras da categoria.");
  const [categoryAttributes, category] = await Promise.all([attributesResponse.json(), categoryResponse.json()]);
  const built = buildGenericUserProductPayloads({
    product: { id: String(product.product_id), title: String(product.title), description: String(product.description ?? ""), supplierCode: String(product.external_id), sku: String(product.product_scx_sku), stockQuantity: Number(product.stock_quantity), images: imagesResult.rows.map((row) => String(row.url)), offerPricesInCents: {}, variants },
    profile: { status: product.status, categoryId: product.category_id, domainId: product.domain_id, familyName: String(product.title), maxPictures: Number(category.settings?.max_pictures_per_item ?? 12), variationAxes: product.variation_axes ?? [], packQuantities: packResult.packs.map((pack) => pack.unitsPerPack), attributeMappings: product.attribute_mapping ?? [] },
    categoryAttributes,
    packages: packResult.packs,
  });
  const results = [];
  for (const payload of built.payloads) {
    const response = await fetch("https://api.mercadolibre.com/items/validate", { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload.body) });
    const body = await response.json().catch(() => null);
    const causes = Array.isArray(body?.cause) ? body.cause : [];
    results.push({ sku: payload.sku, unitsPerPack: payload.unitsPerPack, packageConfidence: payload.package.confidence, accepted: causes.every((cause) => cause.type !== "error"), errors: causes.filter((cause) => cause.type === "error").map((cause) => ({ code: cause.code, message: cause.message })), warnings: causes.filter((cause) => cause.type === "warning").map((cause) => cause.code) });
  }
  const groups = [...new Set(results.map((item) => item.unitsPerPack))].map((unitsPerPack) => {
    const group = results.filter((item) => item.unitsPerPack === unitsPerPack);
    return {
      unitsPerPack,
      packageConfidence: group[0]?.packageConfidence,
      total: group.length,
      accepted: group.filter((item) => item.accepted).length,
      rejected: group.filter((item) => !item.accepted).length,
      warningCodes: [...new Set(group.flatMap((item) => item.warnings))],
    };
  });
  const readinessErrors = [...packResult.errors, ...built.errors]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.code === item.code && candidate.message === item.message) === index)
    .map(({ code, message }) => ({ code, message }));
  const output = {
    sku,
    profile: { categoryId: product.category_id, domainId: product.domain_id },
    readinessErrors,
    total: results.length,
    accepted: results.filter((item) => item.accepted).length,
    rejected: results.filter((item) => !item.accepted).length,
    groups,
    ...(includeDetails ? { results } : {}),
  };
  console.log(JSON.stringify(output, null, 2));
  if (results.some((item) => !item.accepted)) process.exitCode = 1;
} finally {
  await pool.end();
}
