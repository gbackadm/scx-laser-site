import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";

import { decryptSecret } from "../src/domain/mercadoLivre/core.js";
import {
  buildPenUserProductPayloads,
  classifyMercadoLivreValidation,
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
    pool.query(`SELECT p.id, p.sku, sp.external_id FROM scx_catalog_products p LEFT JOIN scx_catalog_supplier_products sp ON sp.id=p.supplier_product_id WHERE p.scx_sku='SCX-CAN-0021' LIMIT 1`),
    pool.query(`SELECT v.id, v.scx_sku, v.price_amount_in_cents, v.stock_quantity, v.attributes,
      COALESCE(array_agg(i.url ORDER BY i.sort_order, i.id) FILTER (WHERE i.id IS NOT NULL), '{}'::text[]) images
      FROM scx_catalog_product_variants v LEFT JOIN scx_catalog_product_variant_images i ON i.variant_id=v.id
      JOIN scx_catalog_products p ON p.id=v.product_id WHERE p.scx_sku='SCX-CAN-0021' AND v.is_active=true
      GROUP BY v.id ORDER BY v.sort_order, v.id`),
    pool.query(`SELECT i.url FROM scx_catalog_product_images i JOIN scx_catalog_products p ON p.id=i.product_id WHERE p.scx_sku='SCX-CAN-0021' ORDER BY i.sort_order, i.id`),
  ]);
  if (!account.rows[0] || !product.rows[0]) throw new Error("Conta ou produto piloto ausente.");
  const source = {
    supplierCode: String(product.rows[0].external_id ?? product.rows[0].sku),
    images: images.rows.map((row) => String(row.url)),
    variants: variants.rows.map((row) => ({
      id: String(row.id),
      scxSku: String(row.scx_sku),
      priceInCents: Number(row.price_amount_in_cents),
      stockQuantity: Number(row.stock_quantity),
      attributes: row.attributes ?? {},
      images: (row.images ?? []).map(String),
    })),
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
    results.push({ sku: payload.sku, color: payload.color, ok: validation.accepted, status: response.status, warnings: validation.warnings, errors: validation.errors, response: body });
  }
  console.log(JSON.stringify({ familyName: generated.familyName, description: generated.description, results }, null, 2));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
} finally {
  await pool.end();
}
