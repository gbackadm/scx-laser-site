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
      ORDER BY p.updated_at ASC, p.id ASC
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

  const simulation = await simulateOlistSync({
    triggerSource: "schedule",
    saveRun: true,
  });
  const nextRun = new Date(now.getTime() + settings.autoSyncIntervalMinutes * 60_000);

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

  if (settings.autoSyncMode === "send") {
    return {
      skipped: true,
      reason: "Modo envio configurado, mas envio automatico ainda nao foi liberado.",
      simulation,
    };
  }

  return { skipped: false, simulation };
}

async function postTinyApi(path: string, params: Record<string, string>) {
  const response = await fetch(`https://api.tiny.com.br/api2/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const text = await response.text();

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

async function upsertProductChannelMapping(
  product: OlistSyncProduct,
  sent: { scxSku: string; supplierSku: string; productId: string },
  apiResult: Record<string, unknown>,
) {
  const registros = (apiResult?.retorno as { registros?: unknown[] } | undefined)
    ?.registros;
  const registro = (
    Array.isArray(registros) ? registros[0] : undefined
  ) as
    | {
        registro?: {
          status?: string;
          id?: string | number;
        };
      }
    | undefined;
  const result = registro?.registro;

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

  const token = process.env.OLIST_API_TOKEN ?? process.env.TINY_API_TOKEN;
  if (!token) {
    throw new Error("Token Olist/Tiny nao configurado.");
  }

  const isUpdate = Boolean(product.olist_product_id);
  const sent = buildTinyProduct(
    product,
    settings.defaultOrigin,
    1,
    isUpdate,
    stockMinQuantity,
  );
  const apiResult = await postTinyApi(
    isUpdate ? "produto.alterar.php" : "produto.incluir.php",
    {
      token,
      produto: JSON.stringify({
        produtos: [{ produto: sent.produto }],
      }),
      formato: "JSON",
    },
  );

  await upsertProductChannelMapping(product, sent, apiResult);

  return {
    ok: true,
    skipped: false,
    message: isUpdate ? "Produto atualizado no Olist." : "Produto criado no Olist.",
  };
}
