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

const token = process.env.OLIST_API_TOKEN ?? process.env.TINY_API_TOKEN;
if (!token) {
  throw new Error("OLIST_API_TOKEN nao configurado.");
}

async function tinyPost(path, params) {
  const response = await fetch(`https://api.tiny.com.br/api2/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, formato: "JSON", ...params }),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Olist/Tiny respondeu HTTP ${response.status}.`);
  }

  return JSON.parse(text);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const recovered = [];
const errors = [];

try {
  const { rows: products } = await pool.query(`
    SELECT
      product.id,
      product.scx_sku,
      mapping.external_id AS old_external_id,
      coalesce(
        json_agg(
          json_build_object(
            'id', variant.id,
            'scx_sku', variant.scx_sku,
            'supplier_sku', variant.supplier_sku
          )
          ORDER BY variant.sort_order, variant.id
        ) FILTER (WHERE variant.id IS NOT NULL),
        '[]'::json
      ) AS variants
    FROM scx_catalog_products product
    INNER JOIN scx_catalog_product_channel_mappings mapping
      ON mapping.product_id = product.id
     AND mapping.channel = 'olist'
    LEFT JOIN scx_catalog_product_variants variant
      ON variant.product_id = product.id
     AND variant.is_active
    WHERE mapping.sync_status = 'failed'
      AND mapping.raw_response::text LIKE '%Registro em duplicidade - código (SKU)%'
    GROUP BY product.id, product.scx_sku, mapping.external_id
    ORDER BY product.id
  `);

  for (const product of products) {
    try {
      const search = await tinyPost("produtos.pesquisa.php", {
        pesquisa: product.scx_sku,
      });
      const found = search.retorno?.produtos
        ?.map((entry) => entry.produto)
        .find(
          (entry) =>
            entry?.codigo === product.scx_sku &&
            String(entry.id) !== String(product.old_external_id) &&
            entry.tipoVariacao === "P",
        );

      if (!found?.id) {
        throw new Error("Pai variavel com SKU SCX nao localizado.");
      }

      const detailResponse = await tinyPost("produto.obter.php", {
        id: String(found.id),
      });
      const detail = detailResponse.retorno?.produto;

      if (!detail?.id || detail.tipoVariacao !== "P") {
        throw new Error("Cadastro localizado nao e um pai variavel.");
      }

      const externalVariants = new Map(
        (detail.variacoes ?? [])
          .map((entry) => entry.variacao)
          .filter((variant) => variant?.id && variant?.codigo)
          .map((variant) => [variant.codigo, variant]),
      );
      const missingVariants = product.variants.filter(
        (variant) => !externalVariants.has(variant.scx_sku),
      );

      if (missingVariants.length > 0) {
        throw new Error(
          `Variacoes nao localizadas: ${missingVariants
            .map((variant) => variant.scx_sku)
            .join(", ")}.`,
        );
      }

      if (execute) {
        await pool.query("BEGIN");
        try {
          await pool.query(
            `
              UPDATE scx_catalog_product_channel_mappings
              SET external_id = $2,
                external_sku = $3,
                sync_status = 'synced',
                last_synced_at = now(),
                raw_response = $4::jsonb,
                updated_at = now()
              WHERE product_id = $1
                AND channel = 'olist'
            `,
            [product.id, String(detail.id), product.scx_sku, JSON.stringify(detail)],
          );

          for (const variant of product.variants) {
            const external = externalVariants.get(variant.scx_sku);
            await pool.query(
              `
                INSERT INTO scx_catalog_product_variant_channel_mappings (
                  id,
                  variant_id,
                  channel,
                  external_id,
                  external_sku,
                  supplier_sku,
                  sync_status,
                  last_synced_at,
                  raw_response,
                  updated_at
                )
                VALUES ($1, $2, 'olist', $3, $4, $5, 'synced', now(), $6::jsonb, now())
                ON CONFLICT (variant_id, channel)
                DO UPDATE SET
                  external_id = EXCLUDED.external_id,
                  external_sku = EXCLUDED.external_sku,
                  supplier_sku = EXCLUDED.supplier_sku,
                  sync_status = 'synced',
                  last_synced_at = now(),
                  raw_response = EXCLUDED.raw_response,
                  updated_at = now()
              `,
              [
                `variant-channel-${variant.id}-olist`,
                variant.id,
                String(external.id),
                variant.scx_sku,
                variant.supplier_sku,
                JSON.stringify(external),
              ],
            );
          }

          await pool.query("COMMIT");
        } catch (error) {
          await pool.query("ROLLBACK");
          throw error;
        }
      }

      recovered.push({
        productId: product.id,
        newExternalId: String(detail.id),
        variants: product.variants.length,
      });
    } catch (error) {
      errors.push({
        productId: product.id,
        error: error instanceof Error ? error.message : "Erro desconhecido.",
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "simulation",
        selectedProducts: products.length,
        recoveredProducts: recovered.length,
        recoveredVariants: recovered.reduce((sum, item) => sum + item.variants, 0),
        errorCount: errors.length,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
