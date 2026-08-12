import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const execute = process.argv.includes("--execute");

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  const match = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m);
  if (match) process.env.DATABASE_URL = match[1].trim();
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL nao configurada.");
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function skuPrefix(categoryName) {
  return (
    String(categoryName)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "PRO"
  );
}

async function nextScxSku(client, categoryName) {
  const prefix = skuPrefix(categoryName);
  const { rows } = await client.query(
    `SELECT scx_sku FROM scx_catalog_products WHERE scx_sku LIKE $1`,
    [`SCX-${prefix}-%`],
  );
  const lastSequence = rows.reduce((highest, row) => {
    const sequence = Number(row.scx_sku?.match(/-(\d+)$/)?.[1] ?? 0);
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  return `SCX-${prefix}-${String(lastSequence + 1).padStart(4, "0")}`;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

try {
  const minimumStockResult = await pool.query(`
    SELECT COALESCE(publication_stock_min_quantity, 1000)::int AS minimum_stock
    FROM scx_catalog_pricing_rules
    WHERE scope = 'global' AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  const minimumStock = minimumStockResult.rows[0]?.minimum_stock ?? 1000;
  const productsResult = await pool.query(`
    SELECT
      supplier.id AS supplier_product_id,
      supplier.external_id,
      supplier.raw_name,
      supplier.raw_description,
      supplier.raw_category,
      supplier.raw_image_urls,
      supplier.suggested_price_amount_in_cents,
      supplier.stock_available,
      supplier.raw_payload,
      product.id AS catalog_product_id,
      product.scx_sku
    FROM scx_catalog_supplier_products supplier
    LEFT JOIN scx_catalog_products product
      ON product.supplier_product_id = supplier.id
        OR product.sku = supplier.external_id
    WHERE supplier.supplier_id = 'asia-import'
    ORDER BY supplier.external_id
  `);

  let created = 0;
  let updated = 0;
  let imageCount = 0;
  const blocked = [];

  for (const product of productsResult.rows) {
    const images = Array.from(
      new Set(
        (product.raw_image_urls ?? [])
          .map((url) => String(url).trim())
          .filter(Boolean),
      ),
    );
    const variations = Array.isArray(product.raw_payload?.variacoes)
      ? product.raw_payload.variacoes
      : [];
    const cost = Number(product.suggested_price_amount_in_cents ?? 0);
    const reasons = [];

    if (!String(product.external_id ?? "").trim()) reasons.push("SKU do fornecedor ausente");
    if (!String(product.raw_name ?? "").trim()) reasons.push("nome ausente");
    if (cost <= 0) reasons.push("custo ausente ou invalido");
    if (images.length === 0) reasons.push("imagem ausente");
    if (variations.length === 0) reasons.push("variacoes ausentes");

    if (reasons.length > 0) {
      blocked.push({ externalId: product.external_id, reasons });
      if (execute) {
        await pool.query(
          `UPDATE scx_catalog_supplier_products SET import_status = 'sync_error', updated_at = now() WHERE id = $1`,
          [product.supplier_product_id],
        );
      }
      continue;
    }

    if (!execute) {
      if (product.catalog_product_id) updated += 1;
      else created += 1;
      imageCount += images.length;
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const categoryName = String(product.raw_category ?? "Sem categoria").trim() || "Sem categoria";
      const categoryId = `cat-${slugify(categoryName) || "sem-categoria"}`;
      await client.query(
        `
          INSERT INTO scx_catalog_categories (id, name, slug, sort_order)
          VALUES ($1, $2, $3, 900)
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
        `,
        [categoryId, categoryName, slugify(categoryName) || "sem-categoria"],
      );

      let catalogProductId = product.catalog_product_id;
      let scxSku = product.scx_sku;
      const stock = Math.max(0, Math.trunc(Number(product.stock_available ?? 0)));
      const publicationStatus = stock >= minimumStock ? "published" : "out_of_stock";

      if (!catalogProductId) {
        catalogProductId = `catalog-${product.external_id}`;
        scxSku = await nextScxSku(client, categoryName);
        const inserted = await client.query(
          `
            INSERT INTO scx_catalog_products (
              id, sku, scx_sku, title, description, category_id,
              supplier_product_id, publication_status, price_amount_in_cents,
              cost_amount_in_cents, stock_policy, stock_quantity, tags
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'tracked', $11, '{}')
            ON CONFLICT (sku) DO UPDATE SET supplier_product_id = EXCLUDED.supplier_product_id
            RETURNING id, scx_sku
          `,
          [
            catalogProductId,
            product.external_id,
            scxSku,
            product.raw_name,
            product.raw_description,
            categoryId,
            product.supplier_product_id,
            publicationStatus,
            Math.round(cost * 2.2),
            cost,
            stock,
          ],
        );
        catalogProductId = inserted.rows[0].id;
        scxSku = inserted.rows[0].scx_sku;
        created += 1;
      } else {
        updated += 1;
      }

      await client.query(
        `
          UPDATE scx_catalog_products
          SET title = $2,
            description = $3,
            category_id = $4,
            supplier_product_id = $5,
            publication_status = $6,
            price_amount_in_cents = $7,
            cost_amount_in_cents = $8,
            stock_policy = 'tracked',
            stock_quantity = $9,
            updated_at = now()
          WHERE id = $1
        `,
        [
          catalogProductId,
          product.raw_name,
          product.raw_description,
          categoryId,
          product.supplier_product_id,
          publicationStatus,
          Math.round(cost * 2.2),
          cost,
          stock,
        ],
      );

      await client.query(`DELETE FROM scx_catalog_product_images WHERE product_id = $1`, [catalogProductId]);
      for (const [index, url] of images.entries()) {
        await client.query(
          `
            INSERT INTO scx_catalog_product_images (id, product_id, url, alt_text, source, sort_order)
            VALUES ($1, $2, $3, $4, 'supplier', $5)
          `,
          [randomUUID(), catalogProductId, url, product.raw_name, index],
        );
        imageCount += 1;
      }

      await client.query(
        `UPDATE scx_catalog_supplier_products SET import_status = 'mapped', updated_at = now() WHERE id = $1`,
        [product.supplier_product_id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      blocked.push({
        externalId: product.external_id,
        reasons: [error instanceof Error ? error.message : String(error)],
      });
    } finally {
      client.release();
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "simulation",
        supplierProducts: productsResult.rows.length,
        created,
        updated,
        images: imageCount,
        blockedCount: blocked.length,
        blocked: blocked.slice(0, 20),
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
