import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabasePool } from "@/domain/catalog/db";
import {
  buildTinyProduct,
  DEFAULT_BATCH_SIZE,
  DEFAULT_STOCK_MIN_QUANTITY,
  summarizeOlistPlan,
  validateOlistProduct,
  type OlistPlanSummary,
  type OlistSyncProduct,
} from "@/domain/olist/core";

export type OlistAutoSyncMode = "simulation" | "send";

type PricingRuleRow = {
  min_quantity: number;
};

type OlistSettingsRow = {
  is_enabled: boolean;
  default_origin: string;
  batch_size: number;
  batch_calls_per_minute: number;
  auto_sync_enabled: boolean;
  auto_sync_interval_minutes: number;
  auto_sync_mode: OlistAutoSyncMode;
  require_manual_simulation_before_send: boolean;
  last_auto_sync_at: Date | string | null;
  next_auto_sync_after: Date | string | null;
  updated_at: Date | string;
};

type OlistRunRow = {
  id: string;
  mode: "simulation" | "send";
  trigger_source: "admin" | "schedule" | "script";
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  selected_products: number;
  eligible_products: number;
  blocked_products: number;
  will_be_active: number;
  will_be_inactive: number;
  creates: number;
  updates: number;
  estimated_api_calls: number;
  blocked_by_reason: Record<string, number>;
  error_message: string | null;
  started_at: Date | string;
  finished_at: Date | string | null;
  created_at: Date | string;
};

function compactProduct(product: OlistSyncProduct) {
  return {
    id: product.id,
    title: product.title,
    scxSku: product.scx_sku ?? product.sku,
    supplierSku: product.external_id ?? product.sku,
    category: product.category,
    stockQuantity: product.stock_quantity,
    status: product.publication_status,
    olistProductId: product.olist_product_id ?? null,
    variationCount: product.variants?.filter((variant) => variant.is_active).length ?? 0,
  };
}

export type AdminOlistSimulation = {
  runId?: string;
  selectedProducts: number;
  eligibleProducts: number;
  blockedProducts: number;
  blockedByReason: Record<string, number>;
  stockMinQuantity: number;
  willBeActive: number;
  willBeInactive: number;
  creates: number;
  updates: number;
  estimatedApiCalls: number;
  eligibleSamples: ReturnType<typeof compactProduct>[];
  blockedSamples: Array<ReturnType<typeof compactProduct> & { reasons: string[] }>;
};

export type AdminOlistSettings = {
  isEnabled: boolean;
  defaultOrigin: string;
  batchSize: number;
  batchCallsPerMinute: number;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
  autoSyncMode: OlistAutoSyncMode;
  requireManualSimulationBeforeSend: boolean;
  lastAutoSyncAt?: string;
  nextAutoSyncAfter?: string;
  updatedAt: string;
};

export type AdminOlistRun = {
  id: string;
  mode: "simulation" | "send";
  triggerSource: "admin" | "schedule" | "script";
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  selectedProducts: number;
  eligibleProducts: number;
  blockedProducts: number;
  willBeActive: number;
  willBeInactive: number;
  creates: number;
  updates: number;
  estimatedApiCalls: number;
  blockedByReason: Record<string, number>;
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
  createdAt: string;
};

export type OlistSettingsUpdate = {
  isEnabled: boolean;
  defaultOrigin: string;
  batchSize: number;
  batchCallsPerMinute: number;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
  autoSyncMode: OlistAutoSyncMode;
  requireManualSimulationBeforeSend: boolean;
  actorUserId: string;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : String(value);
}

function mapSettings(row: OlistSettingsRow): AdminOlistSettings {
  return {
    isEnabled: row.is_enabled,
    defaultOrigin: row.default_origin,
    batchSize: row.batch_size,
    batchCallsPerMinute: row.batch_calls_per_minute,
    autoSyncEnabled: row.auto_sync_enabled,
    autoSyncIntervalMinutes: row.auto_sync_interval_minutes,
    autoSyncMode: row.auto_sync_mode,
    requireManualSimulationBeforeSend: row.require_manual_simulation_before_send,
    lastAutoSyncAt: toIso(row.last_auto_sync_at),
    nextAutoSyncAfter: toIso(row.next_auto_sync_after),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapRun(row: OlistRunRow): AdminOlistRun {
  return {
    id: row.id,
    mode: row.mode,
    triggerSource: row.trigger_source,
    status: row.status,
    selectedProducts: row.selected_products,
    eligibleProducts: row.eligible_products,
    blockedProducts: row.blocked_products,
    willBeActive: row.will_be_active,
    willBeInactive: row.will_be_inactive,
    creates: row.creates,
    updates: row.updates,
    estimatedApiCalls: row.estimated_api_calls,
    blockedByReason: row.blocked_by_reason ?? {},
    errorMessage: row.error_message ?? undefined,
    startedAt: toIso(row.started_at) ?? new Date().toISOString(),
    finishedAt: toIso(row.finished_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

export async function getOlistPublicationStockMinQuantity() {
  const { rows } = await getDatabasePool().query<PricingRuleRow>(`
    SELECT COALESCE(publication_stock_min_quantity, 1000)::int AS min_quantity
    FROM scx_catalog_pricing_rules
    WHERE scope = 'global'
      AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  return rows[0]?.min_quantity ?? DEFAULT_STOCK_MIN_QUANTITY;
}

export async function listProductsForOlistSync(limit?: number) {
  const queryParams: unknown[] = [];
  const safeLimit =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? Math.round(limit)
      : undefined;
  const limitClause = safeLimit ? "LIMIT $1" : "";

  if (safeLimit) {
    queryParams.push(safeLimit);
  }

  const { rows } = await getDatabasePool().query<OlistSyncProduct>(
    `
      SELECT
        p.id,
        p.sku,
        p.scx_sku,
        p.title,
        p.description,
        p.publication_status,
        p.price_amount_in_cents,
        p.cost_amount_in_cents,
        p.stock_quantity,
        c.name AS category,
        sp.supplier_name,
        sp.supplier_id,
        sp.external_id,
        sp.raw_payload,
        scm.external_id AS olist_supplier_id,
        pcm.external_id AS olist_product_id,
        coalesce(images.items, '[]'::json) AS images,
        coalesce(variants.items, '[]'::json) AS variants,
        coalesce(components.items, '[]'::json) AS components,
        coalesce(production_steps.items, '[]'::json) AS production_steps
      FROM scx_catalog_products p
      LEFT JOIN scx_catalog_categories c ON c.id = p.category_id
      LEFT JOIN scx_catalog_supplier_products sp ON sp.id = p.supplier_product_id
      LEFT JOIN scx_catalog_supplier_channel_mappings scm
        ON scm.supplier_id = sp.supplier_id
       AND scm.channel = 'olist'
      LEFT JOIN scx_catalog_product_channel_mappings pcm
        ON pcm.product_id = p.id
       AND pcm.channel = 'olist'
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object('url', i.url, 'sort_order', i.sort_order)
          ORDER BY i.sort_order ASC
        ) AS items
        FROM scx_catalog_product_images i
        WHERE i.product_id = p.id
      ) images ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', variant.id,
            'scx_sku', variant.scx_sku,
            'supplier_sku', variant.supplier_sku,
            'name', variant.name,
            'price_amount_in_cents', variant.price_amount_in_cents,
            'cost_amount_in_cents', variant.cost_amount_in_cents,
            'stock_quantity', variant.stock_quantity,
            'attributes', variant.attributes,
            'is_active', variant.is_active,
            'sort_order', variant.sort_order,
            'olist_variant_id', variant_mapping.external_id,
            'images', coalesce(variant_images.items, '[]'::json)
          )
          ORDER BY variant.sort_order ASC, variant.id ASC
        ) AS items
        FROM scx_catalog_product_variants variant
        LEFT JOIN scx_catalog_product_variant_channel_mappings variant_mapping
          ON variant_mapping.variant_id = variant.id
         AND variant_mapping.channel = 'olist'
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object('url', image.url, 'sort_order', image.sort_order)
            ORDER BY image.sort_order ASC
          ) AS items
          FROM scx_catalog_product_variant_images image
          WHERE image.variant_id = variant.id
        ) variant_images ON true
        WHERE variant.product_id = p.id
      ) variants ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'component_sku', pc.component_sku,
            'component_name', pc.component_name,
            'quantity', pc.quantity,
            'sort_order', pc.sort_order
          )
          ORDER BY pc.sort_order ASC
        ) AS items
        FROM scx_catalog_product_components pc
        WHERE pc.product_id = p.id
      ) components ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(ps.name ORDER BY ps.sort_order ASC) AS items
        FROM scx_catalog_product_production_steps ps
        WHERE ps.product_id = p.id
      ) production_steps ON true
      WHERE p.publication_status IN ('published', 'hidden', 'out_of_stock')
      ORDER BY coalesce(pcm.last_synced_at, '-infinity'::timestamptz) ASC,
        p.updated_at ASC,
        p.id ASC
      ${limitClause}
    `,
    queryParams,
  );

  return rows;
}

export async function getProductForOlistSync(productId: string) {
  const { rows } = await getDatabasePool().query<OlistSyncProduct>(
    `
      SELECT
        p.id,
        p.sku,
        p.scx_sku,
        p.title,
        p.description,
        p.publication_status,
        p.price_amount_in_cents,
        p.cost_amount_in_cents,
        p.stock_quantity,
        c.name AS category,
        sp.supplier_name,
        sp.supplier_id,
        sp.external_id,
        sp.raw_payload,
        scm.external_id AS olist_supplier_id,
        pcm.external_id AS olist_product_id,
        coalesce(images.items, '[]'::json) AS images,
        coalesce(variants.items, '[]'::json) AS variants,
        coalesce(components.items, '[]'::json) AS components,
        coalesce(production_steps.items, '[]'::json) AS production_steps
      FROM scx_catalog_products p
      LEFT JOIN scx_catalog_categories c ON c.id = p.category_id
      LEFT JOIN scx_catalog_supplier_products sp ON sp.id = p.supplier_product_id
      LEFT JOIN scx_catalog_supplier_channel_mappings scm
        ON scm.supplier_id = sp.supplier_id
       AND scm.channel = 'olist'
      LEFT JOIN scx_catalog_product_channel_mappings pcm
        ON pcm.product_id = p.id
       AND pcm.channel = 'olist'
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object('url', i.url, 'sort_order', i.sort_order)
          ORDER BY i.sort_order ASC
        ) AS items
        FROM scx_catalog_product_images i
        WHERE i.product_id = p.id
      ) images ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', variant.id,
            'scx_sku', variant.scx_sku,
            'supplier_sku', variant.supplier_sku,
            'name', variant.name,
            'price_amount_in_cents', variant.price_amount_in_cents,
            'cost_amount_in_cents', variant.cost_amount_in_cents,
            'stock_quantity', variant.stock_quantity,
            'attributes', variant.attributes,
            'is_active', variant.is_active,
            'sort_order', variant.sort_order,
            'olist_variant_id', variant_mapping.external_id,
            'images', coalesce(variant_images.items, '[]'::json)
          )
          ORDER BY variant.sort_order ASC, variant.id ASC
        ) AS items
        FROM scx_catalog_product_variants variant
        LEFT JOIN scx_catalog_product_variant_channel_mappings variant_mapping
          ON variant_mapping.variant_id = variant.id
         AND variant_mapping.channel = 'olist'
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object('url', image.url, 'sort_order', image.sort_order)
            ORDER BY image.sort_order ASC
          ) AS items
          FROM scx_catalog_product_variant_images image
          WHERE image.variant_id = variant.id
        ) variant_images ON true
        WHERE variant.product_id = p.id
      ) variants ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'component_sku', pc.component_sku,
            'component_name', pc.component_name,
            'quantity', pc.quantity,
            'sort_order', pc.sort_order
          )
          ORDER BY pc.sort_order ASC
        ) AS items
        FROM scx_catalog_product_components pc
        WHERE pc.product_id = p.id
      ) components ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(ps.name ORDER BY ps.sort_order ASC) AS items
        FROM scx_catalog_product_production_steps ps
        WHERE ps.product_id = p.id
      ) production_steps ON true
      WHERE p.id = $1
      LIMIT 1
    `,
    [productId],
  );

  return rows[0] ?? null;
}

export function toAdminOlistSimulation(plan: OlistPlanSummary): AdminOlistSimulation {
  return {
    selectedProducts: plan.selectedProducts,
    eligibleProducts: plan.eligibleProducts,
    blockedProducts: plan.blockedProducts,
    blockedByReason: plan.blockedByReason,
    stockMinQuantity: plan.stockMinQuantity,
    willBeActive: plan.willBeActive,
    willBeInactive: plan.willBeInactive,
    creates: plan.creates,
    updates: plan.updates,
    estimatedApiCalls: plan.estimatedApiCalls,
    eligibleSamples: plan.eligibleProductsList.slice(0, 20).map(compactProduct),
    blockedSamples: plan.blockedProductsList.slice(0, 30).map((entry) => ({
      ...compactProduct(entry.product),
      reasons: entry.reasons,
    })),
  };
}

export async function getOlistSettings() {
  const { rows } = await getDatabasePool().query<OlistSettingsRow>(`
    INSERT INTO scx_olist_sync_settings (id)
    VALUES ('default')
    ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
    RETURNING *
  `);

  return mapSettings(rows[0]);
}

export async function updateOlistSettings(input: OlistSettingsUpdate) {
  const safeBatchSize = Math.min(20, Math.max(1, Math.round(input.batchSize)));
  const safeCallsPerMinute = Math.min(
    5,
    Math.max(1, Math.round(input.batchCallsPerMinute)),
  );
  const safeInterval = Math.max(60, Math.round(input.autoSyncIntervalMinutes));
  const nextAutoSyncAfter = input.autoSyncEnabled
    ? new Date(Date.now() + safeInterval * 60_000)
    : null;
  const { rows } = await getDatabasePool().query<OlistSettingsRow>(
    `
      INSERT INTO scx_olist_sync_settings (
        id,
        is_enabled,
        default_origin,
        batch_size,
        batch_calls_per_minute,
        auto_sync_enabled,
        auto_sync_interval_minutes,
        auto_sync_mode,
        require_manual_simulation_before_send,
        next_auto_sync_after,
        updated_by,
        updated_at
      )
      VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      ON CONFLICT (id)
      DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        default_origin = EXCLUDED.default_origin,
        batch_size = EXCLUDED.batch_size,
        batch_calls_per_minute = EXCLUDED.batch_calls_per_minute,
        auto_sync_enabled = EXCLUDED.auto_sync_enabled,
        auto_sync_interval_minutes = EXCLUDED.auto_sync_interval_minutes,
        auto_sync_mode = EXCLUDED.auto_sync_mode,
        require_manual_simulation_before_send = EXCLUDED.require_manual_simulation_before_send,
        next_auto_sync_after = EXCLUDED.next_auto_sync_after,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING *
    `,
    [
      input.isEnabled,
      input.defaultOrigin.trim() || "2",
      safeBatchSize,
      safeCallsPerMinute,
      input.autoSyncEnabled,
      safeInterval,
      input.autoSyncMode,
      input.requireManualSimulationBeforeSend,
      nextAutoSyncAfter,
      input.actorUserId,
    ],
  );

  return mapSettings(rows[0]);
}

export async function listOlistRuns(limit = 10) {
  const { rows } = await getDatabasePool().query<OlistRunRow>(
    `
      SELECT *
      FROM scx_olist_sync_runs
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [Math.min(50, Math.max(1, Math.round(limit)))],
  );

  return rows.map(mapRun);
}

async function saveOlistSimulationRun({
  plan,
  settings,
  actorUserId,
  triggerSource,
}: {
  plan: OlistPlanSummary;
  settings: AdminOlistSettings;
  actorUserId?: string;
  triggerSource: "admin" | "schedule" | "script";
}) {
  const runId = randomUUID();
  await getDatabasePool().query(
    `
      INSERT INTO scx_olist_sync_runs (
        id,
        mode,
        trigger_source,
        status,
        actor_user_id,
        selected_products,
        eligible_products,
        blocked_products,
        will_be_active,
        will_be_inactive,
        creates,
        updates,
        estimated_api_calls,
        blocked_by_reason,
        settings_snapshot,
        result_snapshot,
        finished_at
      )
      VALUES (
        $1,
        'simulation',
        $2,
        'completed',
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        now()
      )
    `,
    [
      runId,
      triggerSource,
      actorUserId ?? null,
      plan.selectedProducts,
      plan.eligibleProducts,
      plan.blockedProducts,
      plan.willBeActive,
      plan.willBeInactive,
      plan.creates,
      plan.updates,
      plan.estimatedApiCalls,
      JSON.stringify(plan.blockedByReason),
      JSON.stringify(settings),
      JSON.stringify(toAdminOlistSimulation(plan)),
    ],
  );

  return runId;
}

export async function simulateOlistSync({
  limit,
  actorUserId,
  triggerSource = "admin",
  saveRun = true,
}: {
  limit?: number;
  actorUserId?: string;
  triggerSource?: "admin" | "schedule" | "script";
  saveRun?: boolean;
} = {}) {
  const [products, stockMinQuantity, settings] = await Promise.all([
    listProductsForOlistSync(limit),
    getOlistPublicationStockMinQuantity(),
    getOlistSettings(),
  ]);
  const plan = summarizeOlistPlan(products, stockMinQuantity, settings.batchSize);
  const simulation = toAdminOlistSimulation(plan);

  if (saveRun) {
    simulation.runId = await saveOlistSimulationRun({
      plan,
      settings,
      actorUserId,
      triggerSource,
    });
  }

  return simulation;
}

async function postTinyApi(path: string, params: Record<string, string>) {
  const response = await fetch(`https://api.tiny.com.br/api2/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Olist/Tiny respondeu HTTP ${response.status}.`);
  }

  try {
    return JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error("Olist/Tiny respondeu em formato invalido.");
  }
}

type TinySentProduct = ReturnType<typeof buildTinyProduct>;

type TinyApiRecord = {
  sequencia?: string | number;
  status?: string;
  id?: string | number;
  erros?: Array<{ erro?: string }>;
  variacoes?: Array<{
    variacao?: {
      id?: string | number;
    };
  }>;
};

function tinyApiRecords(apiResult: Record<string, unknown>) {
  const retorno = apiResult.retorno as
    | {
        registros?: Array<{ registro?: TinyApiRecord }>;
        erros?: Array<{ erro?: string }>;
      }
    | undefined;

  return {
    records: Array.isArray(retorno?.registros)
      ? retorno.registros.map((entry) => entry.registro ?? {})
      : [],
    generalErrors: Array.isArray(retorno?.erros)
      ? retorno.erros.map((entry) => entry.erro).filter(Boolean)
      : [],
  };
}

function tinyRecordError(record: TinyApiRecord, generalErrors: unknown[]) {
  const errors = Array.isArray(record.erros)
    ? record.erros.map((entry) => entry.erro).filter(Boolean)
    : [];
  return [...errors, ...generalErrors.map(String)].join(" | ") ||
    "Olist/Tiny nao confirmou o produto.";
}

async function upsertProductChannelMapping(
  product: OlistSyncProduct,
  sent: TinySentProduct,
  result: TinyApiRecord,
) {
  if (result?.status !== "OK" || !result.id) {
    throw new Error("Olist/Tiny nao confirmou o produto.");
  }

  await getDatabasePool().query(
    `
      INSERT INTO scx_catalog_product_channel_mappings (
        id,
        product_id,
        channel,
        external_id,
        external_sku,
        supplier_sku,
        sync_status,
        last_synced_at,
        raw_response,
        updated_at
      )
      VALUES ($1, $2, 'olist', $3, $4, $5, 'synced', now(), $6, now())
      ON CONFLICT (product_id, channel)
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
      `product-channel-${sent.productId}-olist`,
      product.id,
      String(result.id),
      sent.scxSku,
      sent.supplierSku,
      JSON.stringify(result),
    ],
  );

  const returnedVariants = Array.isArray(result.variacoes)
    ? result.variacoes
    : [];

  for (const [index, sentVariant] of sent.variants.entries()) {
    const externalId = returnedVariants[index]?.variacao?.id;

    if (!externalId) {
      continue;
    }

    await getDatabasePool().query(
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
        `variant-channel-${sentVariant.variantId}-olist`,
        sentVariant.variantId,
        String(externalId),
        sentVariant.scxSku,
        sentVariant.supplierSku,
        JSON.stringify(returnedVariants[index]?.variacao ?? {}),
      ],
    );
  }
}

async function markProductOlistSyncFailed(
  product: OlistSyncProduct,
  record: TinyApiRecord,
) {
  if (!product.olist_product_id) {
    return;
  }

  await getDatabasePool().query(
    `
      UPDATE scx_catalog_product_channel_mappings
      SET sync_status = 'failed',
        raw_response = $2::jsonb,
        updated_at = now()
      WHERE product_id = $1
        AND channel = 'olist'
    `,
    [product.id, JSON.stringify(record)],
  );
}

async function sendTinyProductBatch({
  products,
  settings,
  stockMinQuantity,
  isUpdate,
  includeVariations = true,
  archiveExistingProduct = false,
}: {
  products: OlistSyncProduct[];
  settings: AdminOlistSettings;
  stockMinQuantity: number;
  isUpdate: boolean;
  includeVariations?: boolean;
  archiveExistingProduct?: boolean;
}) {
  const token = process.env.OLIST_API_TOKEN ?? process.env.TINY_API_TOKEN;
  if (!token) {
    throw new Error("Token Olist/Tiny nao configurado.");
  }

  const sentProducts = products.map((product, index) => {
    const sent = buildTinyProduct(
      product,
      settings.defaultOrigin,
      index + 1,
      isUpdate,
      stockMinQuantity,
      { includeVariations },
    );

    if (archiveExistingProduct) {
      sent.produto.codigo = `LEG-${sent.scxSku}`.slice(0, 30);
      sent.produto.nome = `[LEGADO ${product.olist_product_id}] ${product.title}`.slice(
        0,
        120,
      );
      sent.produto.situacao = "I";
      sent.produto.variacoes = undefined;
    }

    return sent;
  });
  const apiResult = await postTinyApi(
    isUpdate ? "produto.alterar.php" : "produto.incluir.php",
    {
      token,
      produto: JSON.stringify({
        produtos: sentProducts.map(({ produto }) => ({ produto })),
      }),
      formato: "JSON",
    },
  );
  const { records, generalErrors } = tinyApiRecords(apiResult);
  const results: Array<{
    productId: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const [index, product] of products.entries()) {
    const sequenceRecord = records.find(
      (record) => Number(record.sequencia) === index + 1,
    );
    const record = sequenceRecord ?? records[index] ?? {};

    if (record.status === "OK" && record.id) {
      if (!archiveExistingProduct) {
        await upsertProductChannelMapping(product, sentProducts[index], record);
      }
      results.push({ productId: product.id, ok: true });
    } else {
      await markProductOlistSyncFailed(product, record);
      results.push({
        productId: product.id,
        ok: false,
        error: tinyRecordError(record, generalErrors),
      });
    }
  }

  return results;
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function needsOlistClassConversion(product: OlistSyncProduct) {
  return Boolean(
    product.olist_product_id &&
      product.variants?.some((variant) => variant.is_active) &&
      !product.variants?.some((variant) => variant.olist_variant_id),
  );
}

export type OlistSendResult = {
  runId: string;
  selectedProducts: number;
  eligibleProducts: number;
  blockedProducts: number;
  sentProducts: number;
  failedProducts: number;
  deferredProducts: number;
  errors: string[];
};

export async function executeOlistSync({
  actorUserId,
  triggerSource = "admin",
}: {
  actorUserId?: string;
  triggerSource?: "admin" | "schedule" | "script";
} = {}): Promise<OlistSendResult> {
  const [settings, stockMinQuantity] = await Promise.all([
    getOlistSettings(),
    getOlistPublicationStockMinQuantity(),
  ]);

  if (!settings.isEnabled) {
    throw new Error("Conector Olist desativado.");
  }

  if (
    triggerSource === "admin" &&
    settings.requireManualSimulationBeforeSend
  ) {
    const simulationResult = await getDatabasePool().query<{ allowed: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM scx_olist_sync_runs
          WHERE mode = 'simulation'
            AND trigger_source = 'admin'
            AND status = 'completed'
            AND actor_user_id = $1
            AND finished_at >= now() - interval '30 minutes'
        ) AS allowed
      `,
      [actorUserId ?? null],
    );

    if (!simulationResult.rows[0]?.allowed) {
      throw new Error("Rode uma simulacao antes do envio manual.");
    }
  }

  const maxRecords = settings.batchSize * settings.batchCallsPerMinute;
  const products = await listProductsForOlistSync(maxRecords);
  const plan = summarizeOlistPlan(products, stockMinQuantity, settings.batchSize);
  const runId = randomUUID();

  await getDatabasePool().query(
    `
      INSERT INTO scx_olist_sync_runs (
        id,
        mode,
        trigger_source,
        status,
        actor_user_id,
        selected_products,
        eligible_products,
        blocked_products,
        will_be_active,
        will_be_inactive,
        creates,
        updates,
        estimated_api_calls,
        blocked_by_reason,
        settings_snapshot
      )
      VALUES ($1, 'send', $2, 'running', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)
    `,
    [
      runId,
      triggerSource,
      actorUserId ?? null,
      plan.selectedProducts,
      plan.eligibleProducts,
      plan.blockedProducts,
      plan.willBeActive,
      plan.willBeInactive,
      plan.creates,
      plan.updates,
      plan.estimatedApiCalls,
      JSON.stringify(plan.blockedByReason),
      JSON.stringify(settings),
    ],
  );

  const createBatches = chunks(
    plan.eligibleProductsList.filter((product) => !product.olist_product_id),
    settings.batchSize,
  ).map((batch) => ({ batch, isUpdate: false, requiresClassConversion: false, apiCalls: 1 }));
  const regularUpdateBatches = chunks(
    plan.eligibleProductsList.filter(
      (product) => product.olist_product_id && !needsOlistClassConversion(product),
    ),
    settings.batchSize,
  ).map((batch) => ({ batch, isUpdate: true, requiresClassConversion: false, apiCalls: 1 }));
  const conversionBatches = chunks(
    plan.eligibleProductsList.filter(needsOlistClassConversion),
    settings.batchSize,
  ).map((batch) => ({ batch, isUpdate: true, requiresClassConversion: true, apiCalls: 2 }));
  const allBatches = [...createBatches, ...regularUpdateBatches, ...conversionBatches];
  let selectedApiCalls = 0;
  const selectedBatches = allBatches.filter((entry) => {
    if (selectedApiCalls + entry.apiCalls > settings.batchCallsPerMinute) {
      return false;
    }
    selectedApiCalls += entry.apiCalls;
    return true;
  });
  const deferredProducts = allBatches
    .filter((entry) => !selectedBatches.includes(entry))
    .reduce((total, entry) => total + entry.batch.length, 0);
  const batchResults: Array<{
    productId: string;
    ok: boolean;
    error?: string;
  }> = [];

  try {
    for (const entry of selectedBatches) {
      let productsToSend = entry.batch;

      if (entry.requiresClassConversion) {
        const conversionResults = await sendTinyProductBatch({
          products: entry.batch,
          settings,
          stockMinQuantity,
          isUpdate: true,
          includeVariations: false,
          archiveExistingProduct: true,
        });
        const conversionByProduct = new Map(
          conversionResults.map((result) => [result.productId, result]),
        );

        batchResults.push(...conversionResults.filter((result) => !result.ok));
        productsToSend = entry.batch.filter(
          (product) => conversionByProduct.get(product.id)?.ok,
        );
      }

      if (productsToSend.length === 0) {
        continue;
      }

      batchResults.push(
        ...(await sendTinyProductBatch({
          products: productsToSend,
          settings,
          stockMinQuantity,
          isUpdate: entry.requiresClassConversion ? false : entry.isUpdate,
        })),
      );
    }

    const errors = batchResults
      .filter((result) => !result.ok && result.error)
      .map((result) => `${result.productId}: ${result.error}`);
    const sentProducts = batchResults.filter((result) => result.ok).length;
    const failedProducts = batchResults.length - sentProducts;
    const result: OlistSendResult = {
      runId,
      selectedProducts: plan.selectedProducts,
      eligibleProducts: plan.eligibleProducts,
      blockedProducts: plan.blockedProducts,
      sentProducts,
      failedProducts,
      deferredProducts,
      errors: errors.slice(0, 20),
    };

    await getDatabasePool().query(
      `
        UPDATE scx_olist_sync_runs
        SET status = $2,
          result_snapshot = $3::jsonb,
          error_message = $4,
          finished_at = now()
        WHERE id = $1
      `,
      [
        runId,
        failedProducts > 0 ? "failed" : "completed",
        JSON.stringify(result),
        errors.slice(0, 5).join(" | ") || null,
      ],
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    await getDatabasePool().query(
      `
        UPDATE scx_olist_sync_runs
        SET status = 'failed',
          error_message = $2,
          finished_at = now()
        WHERE id = $1
      `,
      [runId, message],
    );
    throw error;
  }
}

export async function runScheduledOlistSyncIfDue() {
  const settings = await getOlistSettings();
  const now = new Date();
  const nextAutoSyncAfter = settings.nextAutoSyncAfter
    ? new Date(settings.nextAutoSyncAfter)
    : null;

  if (!settings.isEnabled || !settings.autoSyncEnabled) {
    return { skipped: true, reason: "Rotina Olist desativada." };
  }

  if (nextAutoSyncAfter && nextAutoSyncAfter > now) {
    return { skipped: true, reason: "Ainda nao chegou o horario da proxima rotina." };
  }

  const lockClient = await getDatabasePool().connect();

  try {
    const lockResult = await lockClient.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext('scx-olist-scheduled-sync')) AS acquired`,
    );

    if (!lockResult.rows[0]?.acquired) {
      return { skipped: true, reason: "Outra rotina Olist ja esta em andamento." };
    }

    const result =
      settings.autoSyncMode === "send"
        ? await executeOlistSync({ triggerSource: "schedule" })
        : await simulateOlistSync({
            triggerSource: "schedule",
            saveRun: true,
          });
    const nextRun = new Date(
      now.getTime() + settings.autoSyncIntervalMinutes * 60_000,
    );

    await getDatabasePool().query(
      `
        UPDATE scx_olist_sync_settings
        SET last_auto_sync_at = $1,
          next_auto_sync_after = $2,
          updated_at = now()
        WHERE id = 'default'
      `,
      [now, nextRun],
    );

    return { skipped: false, result, nextAutoSyncAfter: nextRun.toISOString() };
  } finally {
    await lockClient.query(
      `SELECT pg_advisory_unlock(hashtext('scx-olist-scheduled-sync'))`,
    );
    lockClient.release();
  }
}

export async function syncCatalogProductToOlistIfEnabled(productId: string) {
  const [settings, stockMinQuantity, product] = await Promise.all([
    getOlistSettings(),
    getOlistPublicationStockMinQuantity(),
    getProductForOlistSync(productId),
  ]);

  if (!settings.isEnabled) {
    return { ok: false, skipped: true, message: "Conector Olist desativado." };
  }

  if (!product) {
    return { ok: false, skipped: true, message: "Produto nao encontrado." };
  }

  if (product.publication_status === "draft") {
    return { ok: false, skipped: true, message: "Rascunho nao vai ao Olist." };
  }

  const reasons = validateOlistProduct(product);
  if (reasons.length > 0) {
    return {
      ok: false,
      skipped: true,
      message: `Produto bloqueado para Olist: ${reasons.join(", ")}.`,
    };
  }

  const isUpdate = Boolean(product.olist_product_id);
  if (needsOlistClassConversion(product)) {
    const conversionResults = await sendTinyProductBatch({
      products: [product],
      settings,
      stockMinQuantity,
      isUpdate: true,
      includeVariations: false,
      archiveExistingProduct: true,
    });

    if (!conversionResults[0]?.ok) {
      throw new Error(
        conversionResults[0]?.error ??
          "Olist/Tiny nao confirmou a conversao do produto pai.",
      );
    }
  }

  const results = await sendTinyProductBatch({
    products: [product],
    settings,
    stockMinQuantity,
    isUpdate: isUpdate && !needsOlistClassConversion(product),
  });
  const result = results[0];

  if (!result?.ok) {
    throw new Error(result?.error ?? "Olist/Tiny nao confirmou o produto.");
  }

  return {
    ok: true,
    skipped: false,
    message: isUpdate ? "Produto atualizado no Olist." : "Produto criado no Olist.",
  };
}
