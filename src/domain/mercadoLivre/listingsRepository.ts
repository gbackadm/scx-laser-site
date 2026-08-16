import "server-only";

import { getDatabasePool } from "@/domain/catalog/db";
import { mercadoLivreRequest } from "@/domain/mercadoLivre/client";
import { deletionRequiresClose } from "@/domain/mercadoLivre/listingLifecycle.js";
import { inferListingGroupLabel, inferListingKitSize } from "@/domain/mercadoLivre/listingPresentation.js";
import {
  getMercadoLivreConnection,
  markPendingMercadoLivreNotificationsProcessed,
} from "@/domain/mercadoLivre/repository";
import { planMarketplaceStockSync } from "@/domain/mercadoLivre/stockControl.js";
import { getGlobalPricingRule } from "@/domain/pricing/rules";

export type ManagedMercadoLivreListing = {
  offerId: string | null;
  itemId: string;
  productId: string | null;
  productTitle: string;
  productSku: string;
  externalSku: string;
  variation: string;
  unitsPerPack: number | null;
  title: string;
  status: string;
  subStatus: string[];
  price: number;
  availableQuantity: number;
  localAvailableQuantity: number | null;
  stockStatus: "ok" | "low" | "out";
  pausedByStock: boolean;
  imageUrl: string | null;
  permalink: string | null;
  familyName: string | null;
  userProductId: string | null;
  lastSyncedAt: string | null;
  live: boolean;
  linkedToCatalog: boolean;
  groupKey: string;
  groupLabel: string;
  qualityScore: number | null;
  qualityLevel: string | null;
  qualityPendingActions: string[];
};

export type CatalogMercadoLivreLink = {
  productId: string;
  listingCount: number;
  activeCount: number;
  pausedCount: number;
  lowStockCount: number;
  failedCount: number;
  firstPermalink: string | null;
};

type MercadoLivreItem = {
  id?: string;
  title?: string;
  status?: string;
  sub_status?: string[];
  price?: number;
  available_quantity?: number;
  permalink?: string;
  thumbnail?: string;
  pictures?: Array<{ id?: string; url?: string; secure_url?: string }>;
  family_name?: string;
  user_product_id?: string;
  seller_id?: number;
  seller_custom_field?: string;
  attributes?: Array<{ id?: string; name?: string; value_name?: string }>;
  sold_quantity?: number;
  warnings?: Array<{ code?: string; message?: string }>;
};

type MercadoLivreDescription = { plain_text?: string };

export type MercadoLivreListingEditor = {
  itemId: string;
  productId: string;
  title: string;
  titleEditable: boolean;
  soldQuantity: number;
  price: number;
  description: string;
  pictureSources: string[];
  mediaLibrary: Array<{ id: string; url: string; label: string; owner: "product" | "variant" }>;
};

export type MercadoLivreListingMetric = {
  itemId: string;
  title: string;
  status: string;
  imageUrl: string | null;
  permalink: string | null;
  visits: number | null;
  soldUnits: number;
  lifetimeSoldUnits: number;
  grossRevenue: number;
  saleFees: number;
  conversionRate: number | null;
  availableQuantity: number;
  stockStatus: "ok" | "low" | "out";
};

export type MercadoLivreMetrics = {
  periodDays: number;
  dateFrom: string;
  dateTo: string;
  listings: MercadoLivreListingMetric[];
  totals: {
    listings: number;
    active: number;
    paused: number;
    visits: number;
    visitsUnavailable: number;
    orders: number;
    soldUnits: number;
    grossRevenue: number;
    saleFees: number;
    conversionRate: number | null;
    lowStock: number;
    unansweredQuestions: number | null;
  };
  daily: Array<{ date: string; visits: number; soldUnits: number; grossRevenue: number }>;
};

type MultiGetResult = { code?: number; body?: MercadoLivreItem };
type AccountSearch = { paging?: { total?: number; limit?: number; offset?: number }; results?: string[] };
type ItemVisits = {
  total_visits?: number;
  results?: Array<{ date?: string; total?: number }>;
};
type MercadoLivreOrder = {
  id?: number;
  date_created?: string;
  order_items?: Array<{
    item?: { id?: string };
    quantity?: number;
    unit_price?: number;
    gross_price?: number;
    sale_fee?: number;
  }>;
};
type OrdersSearch = { paging?: { total?: number }; results?: MercadoLivreOrder[] };
type QuestionsSearch = { paging?: { total?: number } };
type ItemPerformance = {
  score?: number;
  level_wording?: string;
  buckets?: Array<{
    key?: string;
    title?: string;
    status?: string;
    variables?: Array<{
      key?: string;
      title?: string;
      status?: string;
      rules?: Array<{
        key?: string;
        title?: string;
        status?: string;
        wordings?: Array<{ title?: string; label?: string }> | { title?: string; label?: string };
      }>;
    }>;
  }>;
};

const performanceCache = new Map<string, { expiresAt: number; value: ItemPerformance | null }>();
let metricsCache: { expiresAt: number; value: MercadoLivreMetrics } | null = null;

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function variationLabel(attributes: Record<string, unknown>) {
  const preferred = ["Cor", "Capacidade", "Tamanho"]
    .map((key) => attributes[key])
    .filter((value) => typeof value === "string" && value.trim());
  return preferred.length ? preferred.join(" / ") : "Produto simples";
}

function liveVariationLabel(attributes: MercadoLivreItem["attributes"]) {
  const preferredIds = new Set(["COLOR", "COLOR_NAME", "SIZE", "CAPACITY"]);
  const values = (attributes ?? [])
    .filter((attribute) => preferredIds.has(String(attribute.id ?? "").toUpperCase()))
    .map((attribute) => String(attribute.value_name ?? "").trim())
    .filter(Boolean);
  return values.length ? [...new Set(values)].join(" / ") : "Produto simples";
}

function liveSku(item: MercadoLivreItem) {
  const attributeSku = item.attributes?.find((attribute) => attribute.id === "SELLER_SKU")?.value_name;
  return String(item.seller_custom_field ?? attributeSku ?? item.id ?? "");
}

function inferredUnitsPerPack(item: MercadoLivreItem) {
  return inferListingKitSize({ sku: liveSku(item), title: item.title });
}

function inferredGroupLabel(item: MercadoLivreItem) {
  return inferListingGroupLabel({ familyName: item.family_name, title: item.title, id: item.id });
}

async function listAccountItemIds(userId: string) {
  const ids: string[] = [];
  const limit = 50;
  for (let offset = 0; offset < 1000; offset += limit) {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const response = await mercadoLivreRequest<AccountSearch>(`/users/${userId}/items/search?${query}`);
    if (!response.ok) throw new Error(apiError(response.body, "Nao foi possivel consultar os anuncios da conta."));
    const page = Array.isArray(response.body?.results) ? response.body.results.map(String) : [];
    ids.push(...page);
    const total = Number(response.body?.paging?.total ?? ids.length);
    if (!page.length || ids.length >= total) break;
  }
  return [...new Set(ids)];
}

async function getItemPerformance(itemId: string) {
  const cached = performanceCache.get(itemId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await mercadoLivreRequest<ItemPerformance>(`/item/${itemId}/performance`);
  const value = response.ok ? response.body : null;
  performanceCache.set(itemId, { expiresAt: Date.now() + 10 * 60 * 1000, value });
  return value;
}

function pendingPerformanceActions(performance: ItemPerformance | null) {
  const pending = (status: unknown) => String(status ?? "").toUpperCase() === "PENDING";
  return (performance?.buckets ?? []).flatMap((bucket) => {
    if (!pending(bucket.status)) return [];
    const variableActions = (bucket.variables ?? []).flatMap((variable) => {
      if (!pending(variable.status)) return [];
      const ruleActions = (variable.rules ?? []).filter((rule) => pending(rule.status)).map((rule) => {
        const wordings = Array.isArray(rule.wordings) ? rule.wordings : rule.wordings ? [rule.wordings] : [];
        return wordings.map((wording) => wording.title ?? wording.label).find(Boolean) ?? rule.title ?? rule.key;
      });
      return ruleActions.length ? ruleActions : [variable.title ?? variable.key];
    });
    return variableActions.length ? variableActions : [bucket.title ?? bucket.key];
  })
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getMercadoLivreMetrics(periodDays = 30): Promise<MercadoLivreMetrics> {
  if (metricsCache && metricsCache.expiresAt > Date.now() && metricsCache.value.periodDays === periodDays) {
    return metricsCache.value;
  }
  const connection = await getMercadoLivreConnection();
  if (!connection) throw new Error("Conta Mercado Livre nao conectada.");
  const pricingRule = await getGlobalPricingRule();
  const itemIds = await listAccountItemIds(connection.userId);
  const items = new Map<string, MercadoLivreItem>();
  for (const batch of chunks(itemIds, 20)) {
    const query = new URLSearchParams({
      ids: batch.join(","),
      attributes: "id,title,status,price,available_quantity,permalink,thumbnail,pictures,sold_quantity",
    });
    const response = await mercadoLivreRequest<MultiGetResult[]>(`/items?${query}`);
    if (!response.ok || !Array.isArray(response.body)) continue;
    response.body.forEach((entry) => {
      if (entry.code === 200 && entry.body?.id) items.set(entry.body.id, entry.body);
    });
  }

  const dateTo = isoDate(new Date());
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - periodDays);
  const dateFrom = isoDate(fromDate);
  const cachedVisits = await getDatabasePool().query(
    `SELECT item_id, total_visits, daily_visits
       FROM scx_mercado_livre_listing_metrics
      WHERE item_id = ANY($1::text[]) AND period_days=$2
        AND fetched_at > now() - interval '10 minutes'`,
    [itemIds, periodDays],
  );
  const visits = new Map<string, ItemVisits | null>(cachedVisits.rows.map((row) => [String(row.item_id), {
    total_visits: Number(row.total_visits),
    results: Array.isArray(row.daily_visits) ? row.daily_visits : [],
  }]));
  const missingVisitIds = itemIds.filter((itemId) => !visits.has(itemId));
  for (const batch of chunks(missingVisitIds, 8)) {
    const results = await Promise.all(batch.map(async (itemId) => {
      const query = new URLSearchParams({ last: String(periodDays), unit: "day", ending: dateTo });
      const response = await mercadoLivreRequest<ItemVisits>(`/items/${itemId}/visits/time_window?${query}`);
      return [itemId, response.ok ? response.body : null] as const;
    }));
    await Promise.all(results.map(async ([itemId, result]) => {
      visits.set(itemId, result);
      if (!result) return;
      await getDatabasePool().query(
        `INSERT INTO scx_mercado_livre_listing_metrics (item_id, period_days, total_visits, daily_visits, fetched_at)
         VALUES ($1,$2,$3,$4::jsonb,now())
         ON CONFLICT (item_id) DO UPDATE SET period_days=EXCLUDED.period_days,
           total_visits=EXCLUDED.total_visits, daily_visits=EXCLUDED.daily_visits, fetched_at=now()`,
        [itemId, periodDays, Number(result.total_visits ?? 0), JSON.stringify(result.results ?? [])],
      );
    }));
  }

  const orders: MercadoLivreOrder[] = [];
  for (let offset = 0; offset < 1000; offset += 50) {
    const query = new URLSearchParams({
      seller: connection.userId,
      "order.status": "paid",
      "order.date_created.from": `${dateFrom}T00:00:00.000-03:00`,
      "order.date_created.to": `${dateTo}T23:59:59.999-03:00`,
      sort: "date_desc",
      limit: "50",
      offset: String(offset),
    });
    const response = await mercadoLivreRequest<OrdersSearch>(`/orders/search?${query}`);
    if (!response.ok) break;
    const page = response.body?.results ?? [];
    orders.push(...page);
    if (!page.length || orders.length >= Number(response.body?.paging?.total ?? orders.length)) break;
  }

  const questionsQuery = new URLSearchParams({
    seller_id: connection.userId,
    status: "UNANSWERED",
    api_version: "4",
    limit: "1",
  });
  const questionsResponse = await mercadoLivreRequest<QuestionsSearch>(`/questions/search?${questionsQuery}`);
  const unansweredQuestions = questionsResponse.ok ? Number(questionsResponse.body?.paging?.total ?? 0) : null;

  const salesByItem = new Map<string, { soldUnits: number; grossRevenue: number; saleFees: number }>();
  const dailySales = new Map<string, { soldUnits: number; grossRevenue: number }>();
  orders.forEach((order) => {
    const date = String(order.date_created ?? "").slice(0, 10);
    order.order_items?.forEach((orderItem) => {
      const itemId = String(orderItem.item?.id ?? "");
      if (!itemId) return;
      const quantity = Number(orderItem.quantity ?? 0);
      const grossRevenue = Number(orderItem.gross_price ?? (Number(orderItem.unit_price ?? 0) * quantity));
      const saleFees = Number(orderItem.sale_fee ?? 0) * quantity;
      const current = salesByItem.get(itemId) ?? { soldUnits: 0, grossRevenue: 0, saleFees: 0 };
      current.soldUnits += quantity;
      current.grossRevenue += grossRevenue;
      current.saleFees += saleFees;
      salesByItem.set(itemId, current);
      if (date) {
        const daily = dailySales.get(date) ?? { soldUnits: 0, grossRevenue: 0 };
        daily.soldUnits += quantity;
        daily.grossRevenue += grossRevenue;
        dailySales.set(date, daily);
      }
    });
  });

  const listings = itemIds.flatMap((itemId) => {
    const item = items.get(itemId);
    if (!item) return [];
    const itemVisits = visits.get(itemId);
    const totalVisits = itemVisits ? Number(itemVisits.total_visits ?? 0) : null;
    const sales = salesByItem.get(itemId) ?? { soldUnits: 0, grossRevenue: 0, saleFees: 0 };
    const availableQuantity = Number(item.available_quantity ?? 0);
    return [{
      itemId,
      title: String(item.title ?? itemId),
      status: String(item.status ?? "unknown"),
      imageUrl: item.pictures?.[0]?.secure_url ?? item.pictures?.[0]?.url ?? item.thumbnail ?? null,
      permalink: item.permalink ?? null,
      visits: totalVisits,
      soldUnits: sales.soldUnits,
      lifetimeSoldUnits: Number(item.sold_quantity ?? 0),
      grossRevenue: sales.grossRevenue,
      saleFees: sales.saleFees,
      conversionRate: totalVisits && totalVisits > 0 ? (sales.soldUnits / totalVisits) * 100 : null,
      availableQuantity,
      stockStatus: availableQuantity <= 0 ? "out" as const
        : availableQuantity < pricingRule.marketplaceLowStockWarningThreshold ? "low" as const : "ok" as const,
    }];
  });

  const dailyVisits = new Map<string, number>();
  visits.forEach((itemVisits) => itemVisits?.results?.forEach((result) => {
    const date = String(result.date ?? "").slice(0, 10);
    if (date) dailyVisits.set(date, (dailyVisits.get(date) ?? 0) + Number(result.total ?? 0));
  }));
  const daily = Array.from({ length: periodDays }, (_, index) => {
    const date = new Date(`${dateFrom}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const key = isoDate(date);
    const sales = dailySales.get(key) ?? { soldUnits: 0, grossRevenue: 0 };
    return { date: key, visits: dailyVisits.get(key) ?? 0, ...sales };
  });
  const totalVisits = listings.reduce((sum, item) => sum + (item.visits ?? 0), 0);
  const soldUnits = listings.reduce((sum, item) => sum + item.soldUnits, 0);
  const value: MercadoLivreMetrics = {
    periodDays,
    dateFrom,
    dateTo,
    listings,
    totals: {
      listings: listings.length,
      active: listings.filter((item) => item.status === "active").length,
      paused: listings.filter((item) => item.status === "paused").length,
      visits: totalVisits,
      visitsUnavailable: listings.filter((item) => item.visits === null).length,
      orders: new Set(orders.map((order) => order.id).filter(Boolean)).size,
      soldUnits,
      grossRevenue: listings.reduce((sum, item) => sum + item.grossRevenue, 0),
      saleFees: listings.reduce((sum, item) => sum + item.saleFees, 0),
      conversionRate: totalVisits > 0 ? (soldUnits / totalVisits) * 100 : null,
      lowStock: listings.filter((item) => item.stockStatus !== "ok").length,
      unansweredQuestions,
    },
    daily,
  };
  metricsCache = { expiresAt: Date.now() + 10 * 60 * 1000, value };
  return value;
}

export async function listCatalogMercadoLivreLinks(): Promise<CatalogMercadoLivreLink[]> {
  const rule = await getGlobalPricingRule();
  const result = await getDatabasePool().query(
    `SELECT product_id, count(*)::int AS listing_count,
            count(*) FILTER (WHERE raw_response->'item'->>'status'='active')::int AS active_count,
            count(*) FILTER (WHERE raw_response->'item'->>'status'='paused')::int AS paused_count,
            count(*) FILTER (WHERE COALESCE(last_known_available_quantity,
              (raw_response->'item'->>'available_quantity')::int, 0) <= $1)::int AS low_stock_count,
            count(*) FILTER (WHERE sync_status='failed')::int AS failed_count,
            min(NULLIF(raw_response->'item'->>'permalink','')) AS first_permalink
       FROM scx_catalog_marketplace_offers
      WHERE channel='mercado_livre' AND external_id IS NOT NULL
      GROUP BY product_id`,
    [rule.marketplaceLowStockWarningThreshold],
  );
  return result.rows.map((row) => ({
    productId: String(row.product_id),
    listingCount: Number(row.listing_count),
    activeCount: Number(row.active_count),
    pausedCount: Number(row.paused_count),
    lowStockCount: Number(row.low_stock_count),
    failedCount: Number(row.failed_count),
    firstPermalink: row.first_permalink ? String(row.first_permalink) : null,
  }));
}

export async function listManagedMercadoLivreListings(): Promise<ManagedMercadoLivreListing[]> {
  const connection = await getMercadoLivreConnection();
  if (!connection) return [];
  const pool = getDatabasePool();
  const pricingRule = await getGlobalPricingRule();
  const result = await pool.query(
    `SELECT offer.id AS offer_id, offer.external_id, offer.external_sku, offer.units_per_pack,
            offer.last_synced_at, offer.raw_response, offer.paused_by_stock,
            product.id AS product_id, product.title AS product_title, product.scx_sku AS product_sku,
            variant.attributes, variant.stock_quantity AS local_stock_units,
            COALESCE(
              (SELECT image.url FROM scx_catalog_product_variant_images image WHERE image.variant_id=variant.id ORDER BY image.sort_order, image.id LIMIT 1),
              (SELECT image.url FROM scx_catalog_product_images image WHERE image.product_id=product.id ORDER BY image.sort_order, image.id LIMIT 1)
            ) AS local_image
       FROM scx_catalog_marketplace_offers offer
       INNER JOIN scx_catalog_products product ON product.id=offer.product_id
       INNER JOIN scx_catalog_product_variants variant ON variant.id=offer.variant_id
      WHERE offer.channel='mercado_livre' AND offer.external_id IS NOT NULL
      ORDER BY offer.updated_at DESC, offer.external_sku`,
  );
  const localByItemId = new Map(result.rows.map((row) => [String(row.external_id), row]));
  const ids = await listAccountItemIds(connection.userId);
  const liveItems = new Map<string, MercadoLivreItem>();
  for (const batch of chunks(ids, 20)) {
    const query = new URLSearchParams({
      ids: batch.join(","),
      attributes: "id,title,status,sub_status,price,available_quantity,permalink,thumbnail,pictures,family_name,user_product_id,seller_id,seller_custom_field,attributes",
    });
    const response = await mercadoLivreRequest<MultiGetResult[]>(`/items?${query}`);
    if (!response.ok || !Array.isArray(response.body)) continue;
    for (const entry of response.body) {
      if (entry.code === 200 && entry.body?.id) liveItems.set(entry.body.id, entry.body);
    }
  }

  await Promise.all([...liveItems.entries()].flatMap(([itemId, item]) => {
    const row = localByItemId.get(itemId);
    if (!row) return [];
    const saved = row.raw_response ?? {};
    return [pool.query(
      `UPDATE scx_catalog_marketplace_offers
          SET sync_status=$2, last_synced_at=now(), last_known_available_quantity=$3,
              raw_response=$4::jsonb, updated_at=now()
        WHERE id=$1`,
      [row.offer_id, item.status === "active" ? "synced" : "disabled",
        Number(item.available_quantity ?? 0), JSON.stringify({ ...saved, item })],
    )];
  }));

  const performanceByItemId = new Map<string, ItemPerformance | null>();
  const measurableIds = ids.filter((itemId) => ["active", "paused"].includes(String(liveItems.get(itemId)?.status ?? "")));
  for (const batch of chunks(measurableIds, 5)) {
    const values = await Promise.all(batch.map(async (itemId) => [itemId, await getItemPerformance(itemId)] as const));
    values.forEach(([itemId, performance]) => performanceByItemId.set(itemId, performance));
  }

  return ids.map((itemId) => {
    const row = localByItemId.get(itemId);
    const saved = (row?.raw_response?.item ?? row?.raw_response ?? {}) as MercadoLivreItem;
    const live = liveItems.get(itemId);
    const item = live ?? saved;
    const linkedToCatalog = Boolean(row);
    const externalSku = row ? String(row.external_sku) : liveSku(item);
    const productTitle = row ? String(row.product_title) : String(item.family_name ?? item.title ?? itemId);
    const productSku = row ? String(row.product_sku) : externalSku;
    const unitsPerPack = row ? Number(row.units_per_pack) : inferredUnitsPerPack(item);
    const family = item.family_name ?? null;
    const inferredLabel = inferredGroupLabel(item);
    const groupKey = row ? `catalog:${row.product_id}` : `ml-title:${inferredLabel.toLocaleLowerCase("pt-BR")}`;
    const performance = performanceByItemId.get(itemId) ?? null;
    const availableQuantity = Number(item.available_quantity ?? 0);
    const localAvailableQuantity = row
      ? Math.floor(Number(row.local_stock_units ?? 0) / Math.max(1, Number(row.units_per_pack ?? 1)))
      : null;
    return {
      offerId: row ? String(row.offer_id) : null,
      itemId,
      productId: row ? String(row.product_id) : null,
      productTitle,
      productSku,
      externalSku,
      variation: row ? variationLabel(row.attributes ?? {}) : liveVariationLabel(item.attributes),
      unitsPerPack,
      title: String(item.title ?? productTitle),
      status: String(item.status ?? "unknown"),
      subStatus: Array.isArray(item.sub_status) ? item.sub_status.map(String) : [],
      price: Number(item.price ?? 0),
      availableQuantity,
      localAvailableQuantity,
      stockStatus: availableQuantity <= 0 ? "out" as const
        : availableQuantity < pricingRule.marketplaceLowStockWarningThreshold ? "low" as const : "ok" as const,
      pausedByStock: row?.paused_by_stock === true,
      imageUrl: item.pictures?.[0]?.secure_url ?? item.pictures?.[0]?.url ?? item.thumbnail ?? row?.local_image ?? null,
      permalink: item.permalink ?? null,
      familyName: item.family_name ?? null,
      userProductId: item.user_product_id ?? null,
      lastSyncedAt: row?.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
      live: Boolean(live),
      linkedToCatalog,
      groupKey,
      groupLabel: linkedToCatalog ? `${productTitle} (${productSku})` : inferredLabel,
      qualityScore: Number.isFinite(Number(performance?.score)) ? Number(performance?.score) : null,
      qualityLevel: performance?.level_wording ? String(performance.level_wording) : null,
      qualityPendingActions: pendingPerformanceActions(performance),
    };
  }).sort((left, right) => left.groupLabel.localeCompare(right.groupLabel, "pt-BR") || (left.unitsPerPack ?? 0) - (right.unitsPerPack ?? 0) || left.variation.localeCompare(right.variation, "pt-BR"));
}

function apiError(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "message" in body) return String(body.message);
  return fallback;
}

async function updateItem(itemId: string, body: Record<string, unknown>) {
  return mercadoLivreRequest<MercadoLivreItem & { message?: string }>(`/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

async function requireLinkedListing(itemId: string) {
  const connection = await getMercadoLivreConnection();
  if (!connection) throw new Error("Conta Mercado Livre nao conectada.");
  const existing = await getDatabasePool().query(
    `SELECT offer.id, offer.product_id, offer.raw_response
       FROM scx_catalog_marketplace_offers offer
      WHERE offer.channel='mercado_livre' AND offer.external_id=$1 LIMIT 1`,
    [itemId],
  );
  if (!existing.rowCount) throw new Error("Este anuncio ainda nao esta vinculado ao catalogo SCX.");
  const current = await mercadoLivreRequest<MercadoLivreItem>(`/items/${itemId}`);
  if (!current.ok) throw new Error(apiError(current.body, "Nao foi possivel consultar o anuncio."));
  if (String(current.body?.seller_id ?? "") !== String(connection.userId)) {
    throw new Error("Anuncio nao pertence a conta Mercado Livre conectada.");
  }
  return { row: existing.rows[0], item: current.body };
}

async function listingMediaLibrary(productId: string) {
  const result = await getDatabasePool().query(
    `SELECT image.id, image.url, 'product' AS owner, 'Produto pai' AS label, image.sort_order
       FROM scx_catalog_product_images image
      WHERE image.product_id=$1 AND btrim(image.url) <> ''
      UNION ALL
     SELECT image.id, image.url, 'variant' AS owner,
            COALESCE(NULLIF(variant.attributes->>'Cor',''), NULLIF(variant.attributes->>'cor',''), variant.scx_sku) AS label,
            image.sort_order
       FROM scx_catalog_product_variant_images image
       INNER JOIN scx_catalog_product_variants variant ON variant.id=image.variant_id
      WHERE variant.product_id=$1 AND variant.is_active=true AND btrim(image.url) <> ''
      ORDER BY owner, sort_order, id`,
    [productId],
  );
  const seen = new Set<string>();
  return result.rows.flatMap((row) => {
    const url = String(row.url);
    if (seen.has(url)) return [];
    seen.add(url);
    return [{
      id: String(row.id), url, label: String(row.label),
      owner: row.owner === "variant" ? "variant" as const : "product" as const,
    }];
  });
}

export async function getManagedMercadoLivreListingEditor(itemId: string): Promise<MercadoLivreListingEditor> {
  const { row, item } = await requireLinkedListing(itemId);
  const [descriptionResponse, mediaLibrary, draft] = await Promise.all([
    mercadoLivreRequest<MercadoLivreDescription>(`/items/${itemId}/description`),
    listingMediaLibrary(String(row.product_id)),
    getDatabasePool().query(
      `SELECT description FROM scx_mercado_livre_product_drafts WHERE product_id=$1 LIMIT 1`,
      [row.product_id],
    ),
  ]);
  const livePictures = (item.pictures ?? [])
    .map((picture) => picture.secure_url ?? picture.url)
    .filter((url): url is string => typeof url === "string" && !url.includes("/processing-image/"));
  const availableUrls = new Set(mediaLibrary.map((asset) => asset.url));
  const selectedPictures = livePictures.filter((url) => availableUrls.has(url));
  return {
    itemId,
    productId: String(row.product_id),
    title: String(item.title ?? ""),
    titleEditable: Number(item.sold_quantity ?? 0) === 0,
    soldQuantity: Number(item.sold_quantity ?? 0),
    price: Number(item.price ?? 0),
    description: descriptionResponse.ok
      ? String(descriptionResponse.body?.plain_text ?? "")
      : String(draft.rows[0]?.description ?? ""),
    pictureSources: selectedPictures.length >= 2 ? selectedPictures : mediaLibrary.slice(0, 2).map((asset) => asset.url),
    mediaLibrary,
  };
}

export async function updateManagedMercadoLivreListing(input: {
  itemId: string;
  title: string;
  price: number;
  description: string;
  pictureSources: string[];
}) {
  const { row, item: current } = await requireLinkedListing(input.itemId);
  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 10 || title.length > 60) throw new Error("O titulo deve ter entre 10 e 60 caracteres.");
  if (title !== current.title && Number(current.sold_quantity ?? 0) > 0) {
    throw new Error("O Mercado Livre nao permite alterar o titulo depois da primeira venda.");
  }
  if (!Number.isFinite(input.price) || input.price <= 0) throw new Error("Informe um preco valido.");
  if (description.length < 80 || description.length > 5000) {
    throw new Error("A descricao deve ter entre 80 e 5.000 caracteres.");
  }
  const library = await listingMediaLibrary(String(row.product_id));
  const allowedUrls = new Set(library.map((asset) => asset.url));
  const pictureSources = [...new Set(input.pictureSources.map((url) => url.trim()).filter(Boolean))];
  if (pictureSources.length < 2 || pictureSources.length > 12) throw new Error("Selecione de 2 a 12 fotos.");
  if (pictureSources.some((url) => !allowedUrls.has(url))) throw new Error("Uma das fotos nao pertence a este produto.");

  const itemBody: Record<string, unknown> = {
    price: Math.round(input.price * 100) / 100,
    pictures: pictureSources.map((source) => ({ source })),
  };
  if (title !== current.title) itemBody.title = title;
  const changed = await updateItem(input.itemId, itemBody);
  if (!changed.ok) throw new Error(apiError(changed.body, "Mercado Livre recusou as alteracoes do anuncio."));

  let descriptionResult = await mercadoLivreRequest<unknown>(`/items/${input.itemId}/description?api_version=2`, {
    method: "PUT",
    body: JSON.stringify({ plain_text: description }),
  });
  if (descriptionResult.status === 404) {
    descriptionResult = await mercadoLivreRequest<unknown>(`/items/${input.itemId}/description`, {
      method: "POST",
      body: JSON.stringify({ plain_text: description }),
    });
  }
  if (!descriptionResult.ok) throw new Error(apiError(descriptionResult.body, "O anuncio foi atualizado, mas a descricao foi recusada."));

  const saved = row.raw_response ?? {};
  await getDatabasePool().query(
    `UPDATE scx_catalog_marketplace_offers
        SET last_synced_at=now(), last_known_available_quantity=$2,
            raw_response=$3::jsonb, updated_at=now()
      WHERE id=$1`,
    [row.id, Number(changed.body?.available_quantity ?? current.available_quantity ?? 0),
      JSON.stringify({ ...saved, item: changed.body, description: { ok: true } })],
  );
  const warnings = (changed.body?.warnings ?? []).map((warning) => warning.message ?? warning.code).filter(Boolean);
  return { item: changed.body, warnings };
}

export async function changeManagedMercadoLivreListing(itemId: string, action: "pause" | "activate" | "delete") {
  const pool = getDatabasePool();
  const connection = await getMercadoLivreConnection();
  if (!connection) throw new Error("Conta Mercado Livre nao conectada.");
  const existing = await pool.query(
    `SELECT id, raw_response FROM scx_catalog_marketplace_offers
      WHERE channel='mercado_livre' AND external_id=$1 LIMIT 1`,
    [itemId],
  );
  const current = await mercadoLivreRequest<MercadoLivreItem>(`/items/${itemId}`);
  if (!current.ok) throw new Error(apiError(current.body, "Nao foi possivel confirmar o anuncio."));
  if (String(current.body?.seller_id ?? "") !== String(connection.userId)) {
    throw new Error("Anuncio nao pertence a conta Mercado Livre conectada.");
  }

  let response;
  if (action === "pause" || action === "activate") {
    const status = action === "pause" ? "paused" : "active";
    response = await updateItem(itemId, { status });
    if (!response.ok) throw new Error(apiError(response.body, `Mercado Livre recusou o status ${status}.`));
  } else {
    if (deletionRequiresClose(String(current.body?.status ?? ""), current.body?.sub_status ?? [])) {
      const closed = await updateItem(itemId, { status: "closed" });
      if (!closed.ok) throw new Error(apiError(closed.body, "Nao foi possivel encerrar o anuncio antes da exclusao."));
    }
    for (const delay of [0, 1000, 2500]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      response = await updateItem(itemId, { deleted: true });
      if (response.ok || response.status !== 409) break;
    }
    if (!response?.ok) throw new Error(apiError(response?.body, "Nao foi possivel excluir o anuncio."));
  }

  if (existing.rows[0]) {
    const saved = existing.rows[0].raw_response ?? {};
    const syncStatus = action === "activate" ? "synced" : "disabled";
    await pool.query(
      `UPDATE scx_catalog_marketplace_offers
          SET sync_status=$2, paused_by_stock=false, last_synced_at=now(),
              last_known_available_quantity=$3, raw_response=$4::jsonb, updated_at=now()
        WHERE id=$1`,
      [existing.rows[0].id, syncStatus, Number(response.body?.available_quantity ?? 0),
        JSON.stringify({ ...saved, item: response.body })],
    );
  }
  return response.body;
}

export type MercadoLivreStockSyncSummary = {
  total: number;
  updated: number;
  paused: number;
  reactivated: number;
  unchanged: number;
  failed: number;
};

export async function syncMercadoLivreStock(): Promise<MercadoLivreStockSyncSummary> {
  const connection = await getMercadoLivreConnection();
  if (!connection) throw new Error("Conta Mercado Livre nao conectada.");
  const pool = getDatabasePool();
  const rule = await getGlobalPricingRule();
  const offers = await pool.query(
    `SELECT offer.id, offer.external_id, offer.units_per_pack, offer.paused_by_stock,
            offer.raw_response, variant.stock_quantity
       FROM scx_catalog_marketplace_offers offer
       INNER JOIN scx_catalog_product_variants variant ON variant.id=offer.variant_id
      WHERE offer.channel='mercado_livre' AND offer.external_id IS NOT NULL
      ORDER BY offer.last_stock_sync_at NULLS FIRST, offer.updated_at ASC`,
  );
  const summary: MercadoLivreStockSyncSummary = {
    total: offers.rowCount ?? 0, updated: 0, paused: 0,
    reactivated: 0, unchanged: 0, failed: 0,
  };
  for (const offer of offers.rows) {
    try {
      const current = await mercadoLivreRequest<MercadoLivreItem>(`/items/${offer.external_id}`);
      if (!current.ok) throw new Error(apiError(current.body, "Falha ao consultar anuncio."));
      if (String(current.body?.seller_id ?? "") !== String(connection.userId)) {
        throw new Error("Anuncio nao pertence a conta conectada.");
      }
      const plan = planMarketplaceStockSync({
        localUnits: Number(offer.stock_quantity),
        unitsPerPack: Number(offer.units_per_pack),
        pauseThreshold: rule.marketplaceStockPauseThreshold,
        currentStatus: String(current.body?.status ?? "unknown"),
        currentQuantity: Number(current.body?.available_quantity ?? 0),
        pausedByStock: offer.paused_by_stock === true,
      });
      let item = current.body;
      if (Object.keys(plan.body).length) {
        const changed = await updateItem(String(offer.external_id), plan.body);
        if (!changed.ok) throw new Error(apiError(changed.body, "Mercado Livre recusou a atualizacao de estoque."));
        item = changed.body;
      }
      const pausedByStock = plan.action === "pause" ? true
        : plan.action === "reactivate" ? false : offer.paused_by_stock === true;
      const syncStatus = item.status === "active" ? "synced" : "disabled";
      await pool.query(
        `UPDATE scx_catalog_marketplace_offers
            SET sync_status=$2, paused_by_stock=$3, last_known_available_quantity=$4,
                last_stock_sync_at=now(), last_stock_sync_error=NULL, last_synced_at=now(),
                raw_response=$5::jsonb, updated_at=now()
          WHERE id=$1`,
        [offer.id, syncStatus, pausedByStock, plan.availableKits,
          JSON.stringify({ ...(offer.raw_response ?? {}), item })],
      );
      if (plan.action === "pause") summary.paused += 1;
      else if (plan.action === "reactivate") summary.reactivated += 1;
      else if (plan.action === "update") summary.updated += 1;
      else summary.unchanged += 1;
    } catch (error) {
      summary.failed += 1;
      await pool.query(
        `UPDATE scx_catalog_marketplace_offers SET last_stock_sync_at=now(),
          last_stock_sync_error=$2, updated_at=now() WHERE id=$1`,
        [offer.id, error instanceof Error ? error.message : "Falha ao sincronizar estoque."],
      );
    }
  }
  await markPendingMercadoLivreNotificationsProcessed();
  return summary;
}
