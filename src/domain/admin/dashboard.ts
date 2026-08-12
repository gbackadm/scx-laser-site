import "server-only";

import { getDatabasePool } from "@/domain/catalog/db";

type DashboardRow = {
  total_products: number;
  published_products: number;
  inactive_products: number;
  draft_products: number;
  total_variants: number;
  variants_without_images: number;
  supplier_products: number;
  supplier_blocked: number;
  olist_mapped: number;
  olist_pending: number;
  asia_enabled: boolean;
  asia_interval_minutes: number;
  asia_last_sync_at: Date | string | null;
  asia_next_page: number;
  olist_enabled: boolean;
  olist_auto_enabled: boolean;
  olist_last_sync_at: Date | string | null;
};

function toIso(value: Date | string | null) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
}

export type AdminDashboardSnapshot = {
  catalog: {
    total: number;
    published: number;
    inactive: number;
    drafts: number;
    variants: number;
    variantsWithoutImages: number;
  };
  supplier: {
    total: number;
    blocked: number;
    enabled: boolean;
    intervalMinutes: number;
    lastSyncAt?: string;
    nextPage: number;
  };
  olist: {
    mapped: number;
    pending: number;
    enabled: boolean;
    automaticEnabled: boolean;
    lastSyncAt?: string;
  };
};

export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const result = await getDatabasePool().query<DashboardRow>(`
    SELECT
      (SELECT count(*)::int FROM scx_catalog_products) AS total_products,
      (SELECT count(*)::int FROM scx_catalog_products WHERE publication_status = 'published') AS published_products,
      (SELECT count(*)::int FROM scx_catalog_products WHERE publication_status IN ('out_of_stock', 'hidden')) AS inactive_products,
      (SELECT count(*)::int FROM scx_catalog_products WHERE publication_status = 'draft') AS draft_products,
      (SELECT count(*)::int FROM scx_catalog_product_variants WHERE is_active) AS total_variants,
      (SELECT count(*)::int
        FROM scx_catalog_product_variants variant
        WHERE variant.is_active
          AND NOT EXISTS (
            SELECT 1 FROM scx_catalog_product_variant_images image
            WHERE image.variant_id = variant.id AND btrim(image.url) <> ''
          )) AS variants_without_images,
      (SELECT count(*)::int FROM scx_catalog_supplier_products WHERE supplier_id = 'asia-import') AS supplier_products,
      (SELECT count(*)::int FROM scx_catalog_supplier_products WHERE supplier_id = 'asia-import' AND import_status = 'sync_error') AS supplier_blocked,
      (SELECT count(*)::int FROM scx_catalog_product_channel_mappings WHERE channel = 'olist' AND sync_status = 'synced') AS olist_mapped,
      (SELECT count(*)::int FROM scx_catalog_product_channel_mappings WHERE channel = 'olist' AND sync_status <> 'synced') AS olist_pending,
      COALESCE((SELECT is_enabled FROM scx_supplier_auto_sync_settings WHERE supplier_id = 'asia-import'), false) AS asia_enabled,
      COALESCE((SELECT interval_minutes FROM scx_supplier_auto_sync_settings WHERE supplier_id = 'asia-import'), 10)::int AS asia_interval_minutes,
      (SELECT last_auto_sync_at FROM scx_supplier_auto_sync_settings WHERE supplier_id = 'asia-import') AS asia_last_sync_at,
      COALESCE((SELECT next_page FROM scx_supplier_auto_sync_settings WHERE supplier_id = 'asia-import'), 1)::int AS asia_next_page,
      COALESCE((SELECT is_enabled FROM scx_olist_sync_settings WHERE id = 'default'), false) AS olist_enabled,
      COALESCE((SELECT auto_sync_enabled FROM scx_olist_sync_settings WHERE id = 'default'), false) AS olist_auto_enabled,
      (SELECT max(finished_at) FROM scx_olist_sync_runs WHERE status = 'completed') AS olist_last_sync_at
  `);
  const row = result.rows[0];

  return {
    catalog: {
      total: row.total_products,
      published: row.published_products,
      inactive: row.inactive_products,
      drafts: row.draft_products,
      variants: row.total_variants,
      variantsWithoutImages: row.variants_without_images,
    },
    supplier: {
      total: row.supplier_products,
      blocked: row.supplier_blocked,
      enabled: row.asia_enabled,
      intervalMinutes: row.asia_interval_minutes,
      lastSyncAt: toIso(row.asia_last_sync_at),
      nextPage: row.asia_next_page,
    },
    olist: {
      mapped: row.olist_mapped,
      pending: row.olist_pending,
      enabled: row.olist_enabled,
      automaticEnabled: row.olist_auto_enabled,
      lastSyncAt: toIso(row.olist_last_sync_at),
    },
  };
}
