import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";

import { decryptSecret } from "../src/domain/mercadoLivre/core.js";
import {
  buildPenUserProductPayloads,
  classifyMercadoLivreValidation,
  derivePackOptions,
  validatePenSource,
} from "../src/domain/mercadoLivre/publishingCore.js";

const { Pool } = pg;

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  const [account, product, variants, images] = await Promise.all([
    pool.query(`SELECT encrypted_access_token FROM scx_mercado_livre_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1`),
    pool.query(`SELECT p.id, p.sku, sp.external_id, sp.raw_payload FROM scx_catalog_products p LEFT JOIN scx_catalog_supplier_products sp ON sp.id=p.supplier_product_id WHERE p.scx_sku='SCX-CAN-0021' LIMIT 1`),
    pool.query(`SELECT v.id, v.scx_sku, v.cost_amount_in_cents, v.stock_quantity, v.attributes,
      COALESCE(array_agg(i.url ORDER BY i.sort_order, i.id) FILTER (WHERE i.id IS NOT NULL), '{}'::text[]) images
      FROM scx_catalog_product_variants v LEFT JOIN scx_catalog_product_variant_images i ON i.variant_id=v.id
      JOIN scx_catalog_products p ON p.id=v.product_id WHERE p.scx_sku='SCX-CAN-0021' AND v.is_active=true
      GROUP BY v.id ORDER BY v.sort_order, v.id`),
    pool.query(`SELECT i.url FROM scx_catalog_product_images i JOIN scx_catalog_products p ON p.id=i.product_id WHERE p.scx_sku='SCX-CAN-0021' ORDER BY i.sort_order, i.id`),
  ]);
  if (!account.rows[0] || !product.rows[0]) throw new Error("Conta ou produto piloto ausente.");
  const properties = product.rows[0].raw_payload?.propriedades ?? {};
  const dimensions = String(properties["dimensao-caixa"] ?? "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const masterUnits = Number.parseInt(String(properties["quant-por-caixa"] ?? ""), 10);
  const innerUnits = Number.parseInt(String(properties["quant-por-caixinha"] ?? ""), 10);
  const weightKg = Number(String(properties["peso-da-caixa"] ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0] ?? 0);
  const pricing = await pool.query(`SELECT r.cost_multiplier, r.loss_percentage, r.fixed_fee_amount_in_cents, r.rounding_mode,
    COALESCE((SELECT discount_percentage FROM scx_catalog_pricing_batch_tiers t WHERE t.pricing_rule_id=r.id AND t.is_active=true AND t.min_quantity <= $1 ORDER BY t.min_quantity DESC LIMIT 1),0) discount_percentage
    FROM scx_catalog_pricing_rules r WHERE r.is_active=true ORDER BY r.updated_at DESC LIMIT 1`, [masterUnits]);
  const priceRule = pricing.rows[0];
  const packs = derivePackOptions({ masterUnits, innerUnits, lengthCm: dimensions[0], widthCm: dimensions[1], heightCm: dimensions[2], weightGrams: Math.round(weightKg * 1000) });
  const kitPrice = async (cost, unitsPerPack) => {
    const tier = (await pool.query(`SELECT discount_percentage FROM scx_catalog_pricing_batch_tiers WHERE pricing_rule_id='global-default' AND is_active=true AND min_quantity <= $1 ORDER BY min_quantity DESC LIMIT 1`, [unitsPerPack])).rows[0];
    const raw = cost * unitsPerPack * Number(priceRule.cost_multiplier) * (1 + Number(priceRule.loss_percentage) / 100) + Number(priceRule.fixed_fee_amount_in_cents);
    const discounted = raw * (1 - Number(tier?.discount_percentage ?? 0) / 100);
    if (priceRule.rounding_mode !== "ending_90") return Math.round(discounted);
    const lower = Math.floor((discounted - 90) / 100) * 100 + 90;
    const upper = lower + 100;
    return Math.round(discounted - lower <= upper - discounted ? lower : upper);
  };
  const normalizedVariants = [];
  for (const row of variants.rows) {
    normalizedVariants.push({
      id: String(row.id), scxSku: String(row.scx_sku), costInCents: Number(row.cost_amount_in_cents), stockQuantity: Number(row.stock_quantity), attributes: row.attributes ?? {}, images: (row.images ?? []).map(String),
      offerPricesInCents: Object.fromEntries(await Promise.all(packs.map(async (pack) => [String(pack.unitsPerPack), await kitPrice(Number(row.cost_amount_in_cents), pack.unitsPerPack)]))),
    });
  }
  const source = {
    supplierCode: String(product.rows[0].external_id ?? product.rows[0].sku),
    images: images.rows.map((row) => String(row.url)),
    packs,
    variants: normalizedVariants,
  };
  const errors = validatePenSource(source);
  if (errors.length) throw new Error(errors.join(" "));
  const generated = buildPenUserProductPayloads(source);
  const token = decryptSecret(account.rows[0].encrypted_access_token, process.env.MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY);
  const results = [];
  for (const payload of generated.payloads) {
    const response = await fetch("https://api.mercadolibre.com/items/validate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload.body),
    });
    const body = await response.json().catch(() => null);
    const validation = classifyMercadoLivreValidation(response.ok, body);
    results.push({ sku: payload.sku, color: payload.color, unitsPerPack: payload.unitsPerPack, ok: validation.accepted, status: response.status, warnings: validation.warnings, errors: validation.errors, response: body });
  }
  if (process.argv.includes("--summary")) {
    const groups = Object.values(Object.groupBy(results, (result) => String(result.unitsPerPack))).map((group) => ({
      unitsPerPack: group[0].unitsPerPack,
      total: group.length,
      accepted: group.filter((result) => result.ok).length,
      rejected: group.filter((result) => !result.ok).length,
      warningCodes: [...new Set(group.flatMap((result) => result.warnings.map((warning) => warning.code)).filter(Boolean))],
    }));
    console.log(JSON.stringify({ total: results.length, accepted: results.filter((result) => result.ok).length, rejected: results.filter((result) => !result.ok).length, groups }, null, 2));
  } else {
    console.log(JSON.stringify({ familyName: generated.familyName, description: generated.description, results }, null, 2));
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1;
} finally {
  await pool.end();
}
