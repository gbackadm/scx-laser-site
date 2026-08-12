import "server-only";

import type { QueryResultRow } from "pg";

import { getDatabasePool } from "./db";
import type { CatalogAccess } from "./repository";
import type {
  AdminUser,
  AuditLogEntry,
  CatalogListFilters,
  CatalogProduct,
  CatalogProductVariant,
  Category,
  EntityId,
  ProductImageReference,
  SupplierProduct,
  SyncRun,
} from "./types";

function money(amountInCents: number | null | undefined) {
  return amountInCents === null || amountInCents === undefined
    ? undefined
    : { currency: "BRL" as const, amountInCents };
}

function mapCategory(row: QueryResultRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parent_id ?? undefined,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function mapImage(row: QueryResultRow): ProductImageReference {
  return {
    id: row.id,
    productId: row.product_id,
    url: row.url,
    altText: row.alt_text,
    source: row.source,
    sortOrder: row.sort_order,
  };
}

function mapCatalogProduct(
  row: QueryResultRow,
  images: ProductImageReference[],
  variants: CatalogProductVariant[],
): CatalogProduct {
  return {
    id: row.id,
    sku: row.sku,
    scxSku: row.scx_sku ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    categoryId: row.category_id,
    supplierProductId: row.supplier_product_id ?? undefined,
    supplierName: row.supplier_name ?? undefined,
    publicationStatus: row.publication_status,
    price: { currency: "BRL", amountInCents: row.price_amount_in_cents },
    cost: money(row.cost_amount_in_cents),
    stock: {
      policy: row.stock_policy,
      quantity: row.stock_quantity,
      lowStockThreshold: row.low_stock_threshold ?? undefined,
    },
    images,
    variants,
    tags: row.tags ?? [],
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

function mapSupplierProduct(row: QueryResultRow): SupplierProduct {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    externalId: row.external_id,
    rawName: row.raw_name,
    rawDescription: row.raw_description ?? undefined,
    rawCategory: row.raw_category ?? undefined,
    rawImageUrls: row.raw_image_urls ?? [],
    cost: money(row.cost_amount_in_cents),
    suggestedPrice: money(row.suggested_price_amount_in_cents),
    stockAvailable: row.stock_available ?? undefined,
    lastImportedAt:
      row.last_imported_at instanceof Date
        ? row.last_imported_at.toISOString()
        : String(row.last_imported_at),
    importStatus: row.import_status,
    rawPayloadRef: row.raw_payload_ref ?? undefined,
  };
}

export function createPostgresCatalogAccess(): CatalogAccess {
  return {
    async listCatalogProducts(filters: CatalogListFilters = {}) {
      const values: unknown[] = [];
      const where: string[] = [];

      if (filters.search?.trim()) {
        values.push(`%${filters.search.trim()}%`);
        where.push(
          `(p.title ILIKE $${values.length}
            OR p.description ILIKE $${values.length}
            OR p.sku ILIKE $${values.length}
            OR p.scx_sku ILIKE $${values.length}
            OR sp.supplier_name ILIKE $${values.length}
            OR category.name ILIKE $${values.length})`,
        );
      }

      if (filters.categoryId) {
        values.push(filters.categoryId);
        where.push(`p.category_id = $${values.length}`);
      }

      if (filters.publicationStatus) {
        values.push(filters.publicationStatus);
        where.push(`p.publication_status = $${values.length}`);
      }

      if (filters.requireStock) {
        where.push("p.stock_quantity > 0");
      }

      if (filters.requireImage) {
        where.push(`
          EXISTS (
            SELECT 1
            FROM scx_catalog_product_images pi
            WHERE pi.product_id = p.id
              AND btrim(pi.url) <> ''
          )
        `);
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const result = await getDatabasePool().query(
        `
          SELECT p.*, sp.supplier_name
          FROM scx_catalog_products p
          LEFT JOIN scx_catalog_supplier_products sp
            ON sp.id = p.supplier_product_id
          LEFT JOIN scx_catalog_categories category
            ON category.id = p.category_id
          ${whereSql}
          ORDER BY p.updated_at DESC, p.title ASC
        `,
        values,
      );
      const productIds = result.rows.map((row) => row.id);
      const imagesByProduct = new Map<EntityId, ProductImageReference[]>();
      const variantsByProduct = new Map<EntityId, CatalogProductVariant[]>();

      if (productIds.length > 0) {
        const imageResult = await getDatabasePool().query(
          `
            SELECT *
            FROM scx_catalog_product_images
            WHERE product_id = ANY($1)
            ORDER BY sort_order ASC, id ASC
          `,
          [productIds],
        );

        for (const row of imageResult.rows) {
          const image = mapImage(row);
          imagesByProduct.set(image.productId, [
            ...(imagesByProduct.get(image.productId) ?? []),
            image,
          ]);
        }

        const variantResult = await getDatabasePool().query(
          `
            SELECT
              variant.*,
              COALESCE(
                array_agg(variant_image.url ORDER BY variant_image.sort_order, variant_image.id)
                  FILTER (WHERE variant_image.url IS NOT NULL),
                '{}'::text[]
              ) AS image_urls
            FROM scx_catalog_product_variants variant
            LEFT JOIN scx_catalog_product_variant_images variant_image
              ON variant_image.variant_id = variant.id
            WHERE variant.product_id = ANY($1)
            GROUP BY variant.id
            ORDER BY variant.product_id, variant.sort_order, variant.id
          `,
          [productIds],
        );

        for (const row of variantResult.rows) {
          const variant: CatalogProductVariant = {
            id: row.id,
            productId: row.product_id,
            scxSku: row.scx_sku,
            supplierSku: row.supplier_sku,
            name: row.name,
            price: { currency: "BRL", amountInCents: row.price_amount_in_cents },
            cost: money(row.cost_amount_in_cents),
            stockQuantity: row.stock_quantity,
            attributes: row.attributes ?? {},
            imageUrls: row.image_urls ?? [],
            isActive: row.is_active,
            sortOrder: row.sort_order,
          };
          variantsByProduct.set(row.product_id, [
            ...(variantsByProduct.get(row.product_id) ?? []),
            variant,
          ]);
        }
      }

      return result.rows.map((row) =>
        mapCatalogProduct(
          row,
          imagesByProduct.get(row.id) ?? [],
          variantsByProduct.get(row.id) ?? [],
        ),
      );
    },
    async listSupplierProducts() {
      const result = await getDatabasePool().query(
        `
          SELECT *
          FROM scx_catalog_supplier_products
          WHERE COALESCE(stock_available, 0) > 0
            AND EXISTS (
              SELECT 1
              FROM unnest(raw_image_urls) AS image_url
              WHERE btrim(image_url) <> ''
            )
          ORDER BY last_imported_at DESC, raw_name ASC
        `,
      );

      return result.rows.map(mapSupplierProduct);
    },
    async listCategories() {
      const result = await getDatabasePool().query(
        `
          SELECT *
          FROM scx_catalog_categories
          WHERE is_active = true
          ORDER BY sort_order ASC, name ASC
        `,
      );

      return result.rows.map(mapCategory);
    },
    async listUsers() {
      const result = await getDatabasePool().query(
        `
          SELECT id, name, email, role, is_active
          FROM scx_catalog_admin_users
          ORDER BY name ASC
        `,
      );

      return result.rows.map(
        (row): AdminUser => ({
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          isActive: row.is_active,
        }),
      );
    },
    async listAuditLog(entityId) {
      const result = await getDatabasePool().query(
        `
          SELECT *
          FROM scx_catalog_audit_log
          WHERE ($1::text IS NULL OR entity_id = $1)
          ORDER BY occurred_at DESC
          LIMIT 100
        `,
        [entityId ?? null],
      );

      return result.rows.map(
        (row): AuditLogEntry => ({
          id: row.id,
          actorUserId: row.actor_user_id ?? undefined,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          occurredAt:
            row.occurred_at instanceof Date
              ? row.occurred_at.toISOString()
              : String(row.occurred_at),
          summary: row.summary,
        }),
      );
    },
    async listSyncRuns() {
      const result = await getDatabasePool().query(
        `
          SELECT *
          FROM scx_catalog_sync_runs
          ORDER BY started_at DESC
          LIMIT 50
        `,
      );

      return result.rows.map(
        (row): SyncRun => ({
          id: row.id,
          source: row.source,
          status: row.status,
          startedAt:
            row.started_at instanceof Date
              ? row.started_at.toISOString()
              : String(row.started_at),
          finishedAt: row.finished_at
            ? row.finished_at instanceof Date
              ? row.finished_at.toISOString()
              : String(row.finished_at)
            : undefined,
          importedCount: row.imported_count,
          mappedCount: row.mapped_count,
          errorMessage: row.error_message ?? undefined,
        }),
      );
    },
  };
}
