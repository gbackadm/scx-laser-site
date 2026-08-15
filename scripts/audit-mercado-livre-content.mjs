import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";

import { extractYoutubeVideoId, orderListingPictureUrls } from "../src/domain/mercadoLivre/listingQuality.js";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  const result = await pool.query(`
    SELECT p.scx_sku, p.title, sp.raw_payload,
           COALESCE(array_agg(DISTINCT pi.url) FILTER (WHERE pi.url IS NOT NULL), '{}') AS product_images,
           v.id AS variant_id, v.scx_sku AS variant_sku, v.attributes,
           COALESCE(array_agg(DISTINCT vi.url) FILTER (WHERE vi.url IS NOT NULL), '{}') AS variant_images
      FROM scx_catalog_products p
      LEFT JOIN scx_catalog_supplier_products sp ON sp.id=p.supplier_product_id
      LEFT JOIN scx_catalog_product_images pi ON pi.product_id=p.id
      LEFT JOIN scx_catalog_product_variants v ON v.product_id=p.id AND v.is_active=true
      LEFT JOIN scx_catalog_product_variant_images vi ON vi.variant_id=v.id
     GROUP BY p.id, sp.raw_payload, v.id
     ORDER BY p.scx_sku, v.sort_order, v.id`);

  const rows = result.rows.map((row) => {
    const pictures = orderListingPictureUrls({
      variantImages: (row.variant_images ?? []).map(String),
      productImages: (row.product_images ?? []).map(String),
      variantAttributes: row.attributes ?? {},
    });
    return {
      productSku: String(row.scx_sku),
      variantSku: row.variant_sku ? String(row.variant_sku) : null,
      pictureCount: pictures.length,
      videoId: extractYoutubeVideoId(row.raw_payload?.video),
    };
  });
  const uniqueProducts = new Set(rows.map((row) => row.productSku));
  const productsWithVideo = new Set(rows.filter((row) => row.videoId).map((row) => row.productSku));
  const insufficient = rows.filter((row) => row.pictureCount < 2);
  console.log(JSON.stringify({
    products: uniqueProducts.size,
    variants: rows.filter((row) => row.variantSku).length,
    productsWithValidVideo: productsWithVideo.size,
    variantsReadyWithTwoPictures: rows.length - insufficient.length,
    variantsWithInsufficientPictures: insufficient.length,
    samplesToFix: insufficient.slice(0, 20),
  }, null, 2));
  if (insufficient.length) process.exitCode = 1;
} finally {
  await pool.end();
}
