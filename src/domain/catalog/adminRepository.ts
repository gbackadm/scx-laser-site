import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabasePool } from "./db";
import { buildMarketplaceTitle } from "./marketplaceTitles.js";
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

export type ManualCatalogProductCreate = {
  scxSku: string;
  supplierCode: string;
  supplierName: string;
  olistSupplierId: string;
  title: string;
  description: string;
  categoryName: string;
  priceAmountInCents: number;
  costAmountInCents: number;
  stockQuantity: number;
  publicationStatus: CatalogPublicationStatus;
  ncm: string;
  weightKg: string;
  heightCm: string;
  widthCm: string;
  lengthCm: string;
  imageUrls: string[];
  variants: ManualCatalogProductVariantCreate[];
};

export type ManualCatalogProductVariantCreate = {
  scxSku: string;
  supplierSku: string;
  name: string;
  priceAmountInCents: number;
  costAmountInCents: number;
  stockQuantity: number;
  attributes: Record<string, string>;
  imageUrls: string[];
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeImageUrls(imageUrls: string[]) {
  return Array.from(
    new Set(imageUrls.map((url) => url.trim()).filter(isHttpUrl)),
  ).slice(0, 10);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function identifier(value: string) {
  return (
    slugify(value)
      .replace(/-/g, "_")
      .replace(/[^a-z0-9_]/g, "") || "produto"
  );
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
  const imageUrls = normalizeImageUrls(input.imageUrls);
  const commercialTitle = buildMarketplaceTitle(input.title, "mercado_livre");

  if (imageUrls.length === 0) {
    throw new Error("O produto precisa ter pelo menos uma foto valida.");
  }

  if (!commercialTitle) {
    throw new Error("O produto precisa ter um titulo comercial valido.");
  }

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
        commercialTitle,
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
        [randomUUID(), input.productId, url, commercialTitle, index],
      );
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

export async function createManualCatalogProductForAdmin(
  input: ManualCatalogProductCreate,
) {
  const pool = getDatabasePool();
  const scxSku = input.scxSku.trim().toUpperCase();
  const supplierCode = input.supplierCode.trim();
  const supplierName = input.supplierName.trim();
  const supplierId = `manual-${identifier(supplierName)}`;
  const supplierProductId = `${supplierId}-${identifier(supplierCode)}`;
  const catalogProductId = `catalog-${identifier(scxSku)}`;
  const categoryId = await ensureCatalogCategory(input.categoryName);
  const imageUrls = normalizeImageUrls(input.imageUrls);
  const commercialTitle = buildMarketplaceTitle(input.title, "mercado_livre", {
    identifiers: [scxSku, supplierCode],
  });
  const variants = input.variants.map((variant) => ({
    ...variant,
    scxSku: variant.scxSku.trim().toUpperCase(),
    supplierSku: variant.supplierSku.trim(),
    name: variant.name.trim(),
    attributes: Object.fromEntries(
      Object.entries(variant.attributes)
        .map(([name, value]) => [name.trim(), value.trim()])
        .filter(([name, value]) => Boolean(name && value)),
    ),
    imageUrls: normalizeImageUrls(variant.imageUrls),
  }));

  if (imageUrls.length === 0) {
    throw new Error("O produto precisa ter pelo menos uma foto valida.");
  }

  if (!commercialTitle) {
    throw new Error("O produto precisa ter um titulo comercial valido.");
  }

  if (variants.length === 0) {
    throw new Error("O produto precisa ter pelo menos uma variacao.");
  }

  const variantScxSkus = variants.map((variant) => variant.scxSku);
  const variantSupplierSkus = variants.map((variant) => variant.supplierSku);
  const variantGrades = variants.map((variant) =>
    JSON.stringify(
      Object.entries(variant.attributes).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );

  if (
    variants.some(
      (variant) =>
        !variant.scxSku ||
        !variant.supplierSku ||
        !variant.name ||
        variant.priceAmountInCents <= 0 ||
        variant.costAmountInCents <= 0 ||
        variant.stockQuantity < 0 ||
        Object.keys(variant.attributes).length === 0,
    ) ||
    new Set(variantScxSkus).size !== variantScxSkus.length ||
    new Set(variantSupplierSkus).size !== variantSupplierSkus.length ||
    new Set(variantGrades).size !== variantGrades.length
  ) {
    throw new Error("As variacoes possuem campos repetidos ou invalidos.");
  }
  const dimensionLabel = `${input.heightCm} x ${input.widthCm} x ${input.lengthCm} cm`;
  const rawPayload = {
    referencia: supplierCode,
    nome: commercialTitle,
    descricao: input.description.trim(),
    preco: (input.costAmountInCents / 100).toFixed(2),
    ncm: input.ncm.trim(),
    altura: input.heightCm,
    largura: input.widthCm,
    comprimento: input.lengthCm,
    peso: input.weightKg,
    categorias: {
      principal: input.categoryName.trim(),
    },
    propriedades: {
      ncm: input.ncm.trim(),
      "peso-do-produto": input.weightKg,
      "dimensao-do-produto": dimensionLabel,
    },
    propriedades2: [
      { slug: "ncm", value: input.ncm.trim() },
      { slug: "peso-do-produto", value: input.weightKg },
      { slug: "dimensao-do-produto", value: dimensionLabel },
    ],
    variacoes: variants.map((variant) => ({
      referencia: variant.supplierSku,
      nome: variant.name,
      preco: (variant.costAmountInCents / 100).toFixed(2),
      qtd_estoque: variant.stockQuantity,
      atributos: Object.fromEntries(
        Object.entries(variant.attributes).map(([name, value]) => [
          slugify(name),
          { name, value },
        ]),
      ),
      imagem: variant.imageUrls[0],
    })),
  };

  const existingResult = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM scx_catalog_products
      WHERE sku = $1
        OR scx_sku = $2
        OR id = $3
      LIMIT 1
    `,
    [supplierCode, scxSku, catalogProductId],
  );

  if (existingResult.rows[0]) {
    throw new Error("Ja existe produto com este SKU SCX ou codigo de fornecedor.");
  }

  const existingVariantResult = await pool.query<{ scx_sku: string }>(
    `
      SELECT scx_sku
      FROM scx_catalog_product_variants
      WHERE upper(scx_sku) = ANY($1::text[])
      LIMIT 1
    `,
    [variantScxSkus],
  );

  if (existingVariantResult.rows[0]) {
    throw new Error("Ja existe produto com um dos SKUs SCX das variacoes.");
  }

  await pool.query("BEGIN");

  try {
    await pool.query(
      `
        INSERT INTO scx_catalog_supplier_products (
          id,
          supplier_id,
          supplier_name,
          external_id,
          raw_name,
          raw_description,
          raw_category,
          raw_image_urls,
          cost_amount_in_cents,
          suggested_price_amount_in_cents,
          stock_available,
          last_imported_at,
          import_status,
          raw_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), 'mapped', $12::jsonb)
      `,
      [
        supplierProductId,
        supplierId,
        supplierName,
        supplierCode,
        commercialTitle,
        input.description.trim() || null,
        input.categoryName.trim(),
        imageUrls,
        input.costAmountInCents,
        input.priceAmountInCents,
        input.stockQuantity,
        JSON.stringify(rawPayload),
      ],
    );

    await pool.query(
      `
        INSERT INTO scx_catalog_supplier_channel_mappings (
          id,
          supplier_id,
          supplier_name,
          channel,
          external_id,
          external_code,
          external_name,
          last_synced_at
        )
        VALUES ($1, $2, $3, 'olist', $4, $5, $3, now())
        ON CONFLICT (supplier_id, channel)
        DO UPDATE SET
          supplier_name = EXCLUDED.supplier_name,
          external_id = EXCLUDED.external_id,
          external_code = EXCLUDED.external_code,
          external_name = EXCLUDED.external_name,
          last_synced_at = now(),
          updated_at = now()
      `,
      [
        `supplier-channel-${supplierId}-olist`,
        supplierId,
        supplierName,
        input.olistSupplierId.trim(),
        supplierCode,
      ],
    );

    await pool.query(
      `
        INSERT INTO scx_catalog_products (
          id,
          sku,
          scx_sku,
          title,
          description,
          category_id,
          supplier_product_id,
          publication_status,
          price_amount_in_cents,
          cost_amount_in_cents,
          stock_policy,
          stock_quantity,
          tags
        )
        VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7, $8, $9, $10, 'tracked', $11, '{}')
      `,
      [
        catalogProductId,
        supplierCode,
        scxSku,
        commercialTitle,
        input.description.trim(),
        categoryId,
        supplierProductId,
        input.publicationStatus,
        input.priceAmountInCents,
        input.costAmountInCents,
        input.stockQuantity,
      ],
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
        [randomUUID(), catalogProductId, url, commercialTitle, index],
      );
    }

    for (const [index, variant] of variants.entries()) {
      const variantId = randomUUID();

      await pool.query(
        `
          INSERT INTO scx_catalog_product_variants (
            id,
            product_id,
            scx_sku,
            supplier_sku,
            name,
            price_amount_in_cents,
            cost_amount_in_cents,
            stock_quantity,
            attributes,
            source,
            sort_order
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'manual', $10)
        `,
        [
          variantId,
          catalogProductId,
          variant.scxSku,
          variant.supplierSku,
          variant.name,
          variant.priceAmountInCents,
          variant.costAmountInCents,
          variant.stockQuantity,
          JSON.stringify(variant.attributes),
          index,
        ],
      );

      for (const [imageIndex, url] of variant.imageUrls.entries()) {
        await pool.query(
          `
            INSERT INTO scx_catalog_product_variant_images (
              id,
              variant_id,
              url,
              alt_text,
              sort_order
            )
            VALUES ($1, $2, $3, $4, $5)
          `,
          [randomUUID(), variantId, url, variant.name, imageIndex],
        );
      }
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  return catalogProductId;
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

  if (product.price.amountInCents <= 0) {
    return "Informe um preco valido antes de publicar.";
  }

  if (!product.images.some((image) => image.url.trim())) {
    return "Adicione pelo menos uma foto valida antes de publicar.";
  }

  if (!product.categoryId) {
    return "Informe uma categoria antes de publicar.";
  }

  if (product.stock.quantity < publicationStockMinQuantity) {
    return `Estoque abaixo do minimo publico (${publicationStockMinQuantity} un.).`;
  }

  return null;
}
