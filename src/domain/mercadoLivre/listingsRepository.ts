import "server-only";

import { getDatabasePool } from "@/domain/catalog/db";
import { mercadoLivreRequest } from "@/domain/mercadoLivre/client";
import { deletionRequiresClose } from "@/domain/mercadoLivre/listingLifecycle.js";
import { inferListingGroupLabel, inferListingKitSize } from "@/domain/mercadoLivre/listingPresentation.js";
import { getMercadoLivreConnection } from "@/domain/mercadoLivre/repository";

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
  imageUrl: string | null;
  permalink: string | null;
  familyName: string | null;
  userProductId: string | null;
  lastSyncedAt: string | null;
  live: boolean;
  linkedToCatalog: boolean;
  groupKey: string;
  groupLabel: string;
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
  pictures?: Array<{ url?: string; secure_url?: string }>;
  family_name?: string;
  user_product_id?: string;
  seller_id?: number;
  seller_custom_field?: string;
  attributes?: Array<{ id?: string; name?: string; value_name?: string }>;
};

type MultiGetResult = { code?: number; body?: MercadoLivreItem };
type AccountSearch = { paging?: { total?: number; limit?: number; offset?: number }; results?: string[] };

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

export async function listManagedMercadoLivreListings(): Promise<ManagedMercadoLivreListing[]> {
  const connection = await getMercadoLivreConnection();
  if (!connection) return [];
  const result = await getDatabasePool().query(
    `SELECT offer.id AS offer_id, offer.external_id, offer.external_sku, offer.units_per_pack,
            offer.last_synced_at, offer.raw_response,
            product.id AS product_id, product.title AS product_title, product.scx_sku AS product_sku,
            variant.attributes,
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
      availableQuantity: Number(item.available_quantity ?? 0),
      imageUrl: item.pictures?.[0]?.secure_url ?? item.pictures?.[0]?.url ?? item.thumbnail ?? row?.local_image ?? null,
      permalink: item.permalink ?? null,
      familyName: item.family_name ?? null,
      userProductId: item.user_product_id ?? null,
      lastSyncedAt: row?.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
      live: Boolean(live),
      linkedToCatalog,
      groupKey,
      groupLabel: linkedToCatalog ? `${productTitle} (${productSku})` : inferredLabel,
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
          SET sync_status=$2, last_synced_at=now(), raw_response=$3::jsonb, updated_at=now()
        WHERE id=$1`,
      [existing.rows[0].id, syncStatus, JSON.stringify({ ...saved, item: response.body })],
    );
  }
  return response.body;
}
