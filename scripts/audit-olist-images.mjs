import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function getTinyProduct(token, id) {
  const response = await fetch("https://api.tiny.com.br/api2/produto.obter.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, id: String(id), formato: "JSON" }),
  });
  const result = await response.json();
  const product = result?.retorno?.produto;

  if (!response.ok || !product) {
    const errors = (result?.retorno?.erros ?? [])
      .map((entry) => entry?.erro)
      .filter(Boolean)
      .join(" | ");
    throw new Error(errors || `Olist did not return product ${id}.`);
  }

  return product;
}

function remoteImageState(product) {
  return {
    attachments: product?.anexos?.length ?? 0,
    external: product?.imagens_externas?.length ?? 0,
  };
}

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]+)=(.+)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const remote = process.argv.includes("--remote");
const remoteLimit = Math.max(1, Math.min(20, Number(argument("--limit", 5)) || 5));

try {
  const { rows } = await pool.query(`
    SELECT
      count(DISTINCT pcm.product_id)::int AS mapped_parents,
      count(DISTINCT CASE WHEN pi.id IS NOT NULL THEN pcm.product_id END)::int AS parents_with_images,
      count(DISTINCT vcm.variant_id)::int AS mapped_variants,
      count(DISTINCT CASE WHEN vi.id IS NOT NULL THEN vcm.variant_id END)::int AS variants_with_images
    FROM scx_catalog_product_channel_mappings pcm
    LEFT JOIN scx_catalog_product_images pi ON pi.product_id = pcm.product_id
    LEFT JOIN scx_catalog_product_variants v ON v.product_id = pcm.product_id
    LEFT JOIN scx_catalog_product_variant_channel_mappings vcm
      ON vcm.variant_id = v.id AND vcm.channel = 'olist'
    LEFT JOIN scx_catalog_product_variant_images vi ON vi.variant_id = v.id
    WHERE pcm.channel = 'olist'
  `);

  const audit = rows[0];
  const healthy =
    audit.mapped_parents === audit.parents_with_images &&
    audit.mapped_variants === audit.variants_with_images;

  console.log(JSON.stringify({ healthy, ...audit }, null, 2));
  if (!healthy) process.exitCode = 1;

  if (remote) {
    const token = process.env.OLIST_API_TOKEN ?? process.env.TINY_API_TOKEN;
    if (!token) throw new Error("OLIST_API_TOKEN or TINY_API_TOKEN is required.");

    const { rows: samples } = await pool.query(
      `
        SELECT
          p.scx_sku,
          pcm.external_id AS parent_id,
          json_agg(
            json_build_object('sku', v.scx_sku, 'id', vcm.external_id)
            ORDER BY v.sort_order, v.id
          ) AS variants
        FROM scx_catalog_products p
        JOIN scx_catalog_product_channel_mappings pcm
          ON pcm.product_id = p.id AND pcm.channel = 'olist'
        JOIN scx_catalog_product_variants v ON v.product_id = p.id
        JOIN scx_catalog_product_variant_channel_mappings vcm
          ON vcm.variant_id = v.id AND vcm.channel = 'olist'
        JOIN scx_catalog_product_variant_images vi ON vi.variant_id = v.id
        GROUP BY p.id, p.scx_sku, pcm.external_id
        ORDER BY p.scx_sku
        LIMIT $1
      `,
      [remoteLimit],
    );
    const remoteResults = [];

    for (const sample of samples) {
      const parent = await getTinyProduct(token, sample.parent_id);
      const variants = [];
      for (const variant of sample.variants) {
        const remoteVariant = await getTinyProduct(token, variant.id);
        variants.push({ sku: variant.sku, ...remoteImageState(remoteVariant) });
      }
      remoteResults.push({
        sku: sample.scx_sku,
        parent: remoteImageState(parent),
        variants,
      });
    }

    const remoteHealthy = remoteResults.every(
      (product) =>
        product.parent.attachments > 0 &&
        product.variants.every((variant) => variant.attachments > 0),
    );
    console.log(JSON.stringify({ remoteHealthy, products: remoteResults }, null, 2));
    if (!remoteHealthy) process.exitCode = 1;
  }
} finally {
  await pool.end();
}
