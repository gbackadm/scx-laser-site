import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const execute = process.argv.includes("--execute");

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  const match = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m);
  if (match) {
    process.env.DATABASE_URL = match[1].trim();
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL nao configurada.");
}

function parseMoneyToCents(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    return Math.round(value * 100);
  }

  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

function parseStock(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function attributeLabel(value) {
  const normalized = String(value)
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
    : "";
}

function normalizeAttributes(value, fallback) {
  const attributes = {};

  if (Array.isArray(value)) {
    for (const rawEntry of value) {
      const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
      const name = attributeLabel(
        entry.attribute ?? entry.atributo ?? entry.key ?? entry.slug ?? entry.name ?? entry.nome ?? "",
      );
      const attributeValue = String(entry.value ?? entry.valor ?? "").trim();
      if (name && attributeValue) {
        attributes[name] = attributeValue;
      }
    }
  } else if (value && typeof value === "object") {
    for (const [key, rawValue] of Object.entries(value)) {
      if (rawValue && typeof rawValue === "object") {
        const name = attributeLabel(key);
        const attributeValue = String(
          rawValue.value ?? rawValue.valor ?? rawValue.label ?? "",
        ).trim();
        if (name && attributeValue) {
          attributes[name] = attributeValue;
        }
      } else if (rawValue !== undefined && rawValue !== null) {
        attributes[key] = String(rawValue).trim();
      }
    }
  }

  return Object.keys(attributes).length > 0
    ? attributes
    : { Modelo: fallback || "Padrao" };
}

function variationScxSku(parentScxSku, supplierSku) {
  const suffix = `-${createHash("sha1")
    .update(supplierSku)
    .digest("hex")
    .slice(0, 5)
    .toUpperCase()}`;
  return `${parentScxSku.slice(0, 30 - suffix.length)}${suffix}`;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

try {
  const productsResult = await pool.query(`
    SELECT
      product.id,
      product.scx_sku,
      supplier.external_id,
      supplier.raw_payload
    FROM scx_catalog_products product
    INNER JOIN scx_catalog_supplier_products supplier
      ON supplier.id = product.supplier_product_id
    WHERE supplier.supplier_id = 'asia-import'
      AND jsonb_typeof(supplier.raw_payload->'variacoes') = 'array'
      AND jsonb_array_length(supplier.raw_payload->'variacoes') > 0
    ORDER BY product.id
  `);

  let variantCount = 0;
  let productCount = 0;
  const errors = [];

  for (const product of productsResult.rows) {
    const rawPayload = product.raw_payload ?? {};
    const variations = Array.isArray(rawPayload.variacoes)
      ? rawPayload.variacoes
      : [];
    const normalized = variations.flatMap((variation, index) => {
      const supplierSku = String(
        variation?.referencia ?? `${product.external_id}-${index + 1}`,
      ).trim();
      const name = String(variation?.nome ?? supplierSku).trim();
      const costAmountInCents =
        parseMoneyToCents(variation?.preco) ??
        parseMoneyToCents(rawPayload.preco) ??
        0;

      if (!supplierSku || !name || costAmountInCents <= 0) {
        return [];
      }

      return [
        {
          supplierSku,
          name,
          costAmountInCents,
          priceAmountInCents: Math.round(costAmountInCents * 2.2),
          stockQuantity: parseStock(variation?.qtd_estoque),
          attributes: normalizeAttributes(variation?.atributos, name),
          imageUrl: String(variation?.imagem ?? "").trim(),
          sortOrder: index,
        },
      ];
    });

    variantCount += normalized.length;
    if (!execute) {
      productCount += 1;
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          UPDATE scx_catalog_product_variants
          SET is_active = false,
            stock_quantity = 0,
            updated_at = now()
          WHERE product_id = $1
            AND source = 'supplier'
        `,
        [product.id],
      );

      for (const variation of normalized) {
        const existingResult = await client.query(
          `
            SELECT id, scx_sku
            FROM scx_catalog_product_variants
            WHERE product_id = $1
              AND supplier_sku = $2
            LIMIT 1
          `,
          [product.id, variation.supplierSku],
        );
        const variantId = existingResult.rows[0]?.id ?? randomUUID();
        const scxSku =
          existingResult.rows[0]?.scx_sku ??
          variationScxSku(product.scx_sku, variation.supplierSku);

        await client.query(
          `
            INSERT INTO scx_catalog_product_variants (
              id, product_id, scx_sku, supplier_sku, name,
              price_amount_in_cents, cost_amount_in_cents, stock_quantity,
              attributes, source, is_active, sort_order, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'supplier', true, $10, now())
            ON CONFLICT (product_id, supplier_sku)
            DO UPDATE SET
              name = EXCLUDED.name,
              price_amount_in_cents = EXCLUDED.price_amount_in_cents,
              cost_amount_in_cents = EXCLUDED.cost_amount_in_cents,
              stock_quantity = EXCLUDED.stock_quantity,
              attributes = EXCLUDED.attributes,
              source = 'supplier',
              is_active = true,
              sort_order = EXCLUDED.sort_order,
              updated_at = now()
          `,
          [
            variantId,
            product.id,
            scxSku,
            variation.supplierSku,
            variation.name,
            variation.priceAmountInCents,
            variation.costAmountInCents,
            variation.stockQuantity,
            JSON.stringify(variation.attributes),
            variation.sortOrder,
          ],
        );

        if (variation.imageUrl) {
          await client.query(
            `
              INSERT INTO scx_catalog_product_variant_images (
                id, variant_id, url, alt_text, sort_order
              )
              VALUES ($1, $2, $3, $4, 0)
              ON CONFLICT (variant_id, url)
              DO UPDATE SET alt_text = EXCLUDED.alt_text, updated_at = now()
            `,
            [randomUUID(), variantId, variation.imageUrl, variation.name],
          );
        }
      }

      await client.query(
        `
          UPDATE scx_catalog_products catalog_product
          SET stock_quantity = totals.stock_quantity,
            price_amount_in_cents = COALESCE(totals.price_amount_in_cents, catalog_product.price_amount_in_cents),
            cost_amount_in_cents = COALESCE(totals.cost_amount_in_cents, catalog_product.cost_amount_in_cents),
            updated_at = now()
          FROM (
            SELECT
              product_id,
              COALESCE(sum(stock_quantity) FILTER (WHERE is_active), 0)::int AS stock_quantity,
              min(price_amount_in_cents) FILTER (WHERE is_active) AS price_amount_in_cents,
              min(cost_amount_in_cents) FILTER (WHERE is_active) AS cost_amount_in_cents
            FROM scx_catalog_product_variants
            WHERE product_id = $1
            GROUP BY product_id
          ) totals
          WHERE catalog_product.id = totals.product_id
        `,
        [product.id],
      );
      await client.query("COMMIT");
      productCount += 1;
    } catch (error) {
      await client.query("ROLLBACK");
      errors.push(`${product.id}: ${error instanceof Error ? error.message : error}`);
    } finally {
      client.release();
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "simulation",
        selectedProducts: productsResult.rows.length,
        normalizedProducts: productCount,
        normalizedVariants: variantCount,
        errorCount: errors.length,
        errors: errors.slice(0, 10),
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
