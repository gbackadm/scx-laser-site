import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabasePool } from "./db";
import type {
  CatalogProduct,
  CatalogPublicationStatus,
  Category,
  ProductImageReference,
} from "./types";

type CatalogProductRow = {
  id: string;
  sku: string;
  scx_sku: string | null;
  title: string;
  description: string | null;
  category_id: string;
  supplier_product_id: string | null;
  publication_status: CatalogPublicationStatus;
  price_amount_in_cents: number;
  cost_amount_in_cents: number | null;
  stock_policy: CatalogProduct["stock"]["policy"];
  stock_quantity: number;
  low_stock_threshold: number | null;
  tags: string[] | null;
  updated_at: Date | string;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
};

type ProductImageRow = {
  id: string;
  product_id: string;
  url: string;
  alt_text: string;
  source: ProductImageReference["source"];
  sort_order: number;
};

export type SupplierProductDetailsForAdmin = {
  id: string;
  supplierId: string;
  supplierName: string;
  externalId: string;
  rawName: string;
  rawDescription?: string;
  rawCategory?: string;
  rawImageUrls: string[];
  suggestedPriceAmountInCents?: number;
  stockAvailable?: number;
  importStatus: string;
  lastImportedAt: string;
  rawPayload: unknown;
};

export type CatalogProductUpdate = {
  productId: string;
  title: string;
  description: string;
  categoryName: string;
  priceAmountInCents: number;
  stockQuantity: number;
  publicationStatus: CatalogPublicationStatus;
  imageUrls: string[];
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parent_id ?? undefined,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function mapImage(row: ProductImageRow): ProductImageReference {
  return {
    id: row.id,
    productId: row.product_id,
    url: row.url,
    altText: row.alt_text,
    source: row.source,
    sortOrder: row.sort_order,
  };
}

function mapProduct(
  row: CatalogProductRow,
  images: ProductImageReference[],
): CatalogProduct {
  return {
    id: row.id,
    sku: row.sku,
    scxSku: row.scx_sku ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    categoryId: row.category_id,
    supplierProductId: row.supplier_product_id ?? undefined,
    publicationStatus: row.publication_status,
    price: {
      currency: "BRL",
      amountInCents: row.price_amount_in_cents,
    },
    cost:
      row.cost_amount_in_cents === null
        ? undefined
        : {
            currency: "BRL",
            amountInCents: row.cost_amount_in_cents,
          },
    stock: {
      policy: row.stock_policy,
      quantity: row.stock_quantity,
      lowStockThreshold: row.low_stock_threshold ?? undefined,
    },
    images,
    tags: row.tags ?? [],
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

export async function getCatalogProductForAdmin(productId: string) {
  const pool = getDatabasePool();
  const [productResult, imageResult] = await Promise.all([
    pool.query<CatalogProductRow>(
      `
        SELECT *
        FROM scx_catalog_products
        WHERE id = $1
        LIMIT 1
      `,
      [productId],
    ),
    pool.query<ProductImageRow>(
      `
        SELECT *
        FROM scx_catalog_product_images
        WHERE product_id = $1
        ORDER BY sort_order ASC, id ASC
      `,
      [productId],
    ),
  ]);

  const product = productResult.rows[0];
  if (!product) {
    return null;
  }

  return mapProduct(product, imageResult.rows.map(mapImage));
}

export async function getSupplierProductDetailsForAdmin(supplierProductId?: string) {
  if (!supplierProductId) {
    return null;
  }

  const result = await getDatabasePool().query(
    `
      SELECT *
      FROM scx_catalog_supplier_products
      WHERE id = $1
      LIMIT 1
    `,
    [supplierProductId],
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    externalId: row.external_id,
    rawName: row.raw_name,
    rawDescription: row.raw_description ?? undefined,
    rawCategory: row.raw_category ?? undefined,
    rawImageUrls: row.raw_image_urls ?? [],
    suggestedPriceAmountInCents: row.suggested_price_amount_in_cents ?? undefined,
    stockAvailable: row.stock_available ?? undefined,
    importStatus: row.import_status,
    lastImportedAt:
      row.last_imported_at instanceof Date
        ? row.last_imported_at.toISOString()
        : String(row.last_imported_at),
    rawPayload: row.raw_payload,
  } satisfies SupplierProductDetailsForAdmin;
}

export async function listCatalogCategoriesForAdmin() {
  const result = await getDatabasePool().query<CategoryRow>(
    `
      SELECT *
      FROM scx_catalog_categories
      WHERE is_active = true
      ORDER BY sort_order ASC, name ASC
    `,
  );

  return result.rows.map(mapCategory);
}

export async function ensureCatalogCategory(categoryName: string) {
  const name = categoryName.trim() || "Sem categoria";
  const slug = slugify(name) || "sem-categoria";
  const id = `cat-${slug}`;
  const existingResult = await getDatabasePool().query<{ id: string }>(
    `
      SELECT id
      FROM scx_catalog_categories
      WHERE id = $1
        OR slug = $2
        OR slug = $1
      LIMIT 1
    `,
    [id, slug],
  );
  const existingId = existingResult.rows[0]?.id;

  if (existingId) {
    await getDatabasePool().query(
      `
        UPDATE scx_catalog_categories
        SET name = $2,
          is_active = true,
          updated_at = now()
        WHERE id = $1
      `,
      [existingId, name],
    );

    return existingId;
  }

  await getDatabasePool().query(
    `
      INSERT INTO scx_catalog_categories (id, name, slug, sort_order)
      VALUES ($1, $2, $3, 500)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        is_active = true,
        updated_at = now()
    `,
    [id, name, slug],
  );

  const result = await getDatabasePool().query<{ id: string }>(
    `
      SELECT id
      FROM scx_catalog_categories
      WHERE slug = $1
      LIMIT 1
    `,
    [slug],
  );

  return result.rows[0]?.id ?? id;
}

export async function updateCatalogProductForAdmin(input: CatalogProductUpdate) {
  const pool = getDatabasePool();
  const categoryId = await ensureCatalogCategory(input.categoryName);
  const imageUrls = Array.from(
    new Set(input.imageUrls.map((url) => url.trim()).filter(Boolean)),
  );

  await pool.query("BEGIN");

  try {
    await pool.query(
      `
        UPDATE scx_catalog_products
        SET title = $2,
          description = NULLIF($3, ''),
          category_id = $4,
          price_amount_in_cents = $5,
          stock_quantity = $6,
          publication_status = $7,
          updated_at = now()
        WHERE id = $1
      `,
      [
        input.productId,
        input.title.trim(),
        input.description.trim(),
        categoryId,
        input.priceAmountInCents,
        input.stockQuantity,
        input.publicationStatus,
      ],
    );

    await pool.query(
      `
        DELETE FROM scx_catalog_product_images
        WHERE product_id = $1
      `,
      [input.productId],
    );

    for (const [index, url] of imageUrls.entries()) {
      await pool.query(
        `
          INSERT INTO scx_catalog_product_images (
            id,
            product_id,
            url,
            alt_text,
            source,
            sort_order
          )
          VALUES ($1, $2, $3, $4, 'curated', $5)
        `,
        [randomUUID(), input.productId, url, input.title.trim(), index],
      );
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

export async function setCatalogPublicationStatus(
  productId: string,
  status: CatalogPublicationStatus,
) {
  await getDatabasePool().query(
    `
      UPDATE scx_catalog_products
      SET publication_status = $2,
        updated_at = now()
      WHERE id = $1
    `,
    [productId, status],
  );
}

export async function deleteCatalogProductForAdmin(productId: string) {
  await getDatabasePool().query(
    `
      DELETE FROM scx_catalog_products
      WHERE id = $1
    `,
    [productId],
  );
}

export function validateProductForPublication(
  product: CatalogProduct | null,
  publicationStockMinQuantity = 0,
) {
  if (!product) {
    return "Produto nao encontrado.";
  }

  if (!product.title.trim()) {
    return "Informe o titulo antes de publicar.";
  }

  if (product.price.amountInCents < 0) {
    return "Informe um preco valido antes de publicar.";
  }

  if (!product.categoryId) {
    return "Informe uma categoria antes de publicar.";
  }

  if (product.stock.quantity < publicationStockMinQuantity) {
    return `Estoque abaixo do minimo publico (${publicationStockMinQuantity} un.).`;
  }

  return null;
}
