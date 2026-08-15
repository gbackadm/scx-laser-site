import "server-only";

import { getDatabasePool } from "@/domain/catalog/db";
import { mercadoLivreRequest } from "@/domain/mercadoLivre/client";
import { deletionRequiresClose } from "@/domain/mercadoLivre/listingLifecycle.js";

export type ManagedMercadoLivreListing = {
  offerId: string;
  itemId: string;
  productId: string;
  productTitle: string;
  productSku: string;
  externalSku: string;
  variation: string;
  unitsPerPack: number;
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
};

type MultiGetResult = { code?: number; body?: MercadoLivreItem };

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function variationLabel(attributes: Record<string, unknown>) {
  const preferred = ["Cor", "Capacidade", "Tamanho"]
    .map((key) => attributes[key])
    .filter((value) => typeof value === "string" && value.trim());
  return preferred.length ? preferred.join(" / ") : "Produto simples";
}

export async function listManagedMercadoLivreListings(): Promise<ManagedMercadoLivreListing[]> {
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
  const ids = result.rows.map((row) => String(row.external_id));
  const liveItems = new Map<string, MercadoLivreItem>();
  for (const batch of chunks(ids, 20)) {
    const query = new URLSearchParams({
      ids: batch.join(","),
      attributes: "id,title,status,sub_status,price,available_quantity,permalink,thumbnail,pictures,family_name,user_product_id",
    });
    const response = await mercadoLivreRequest<MultiGetResult[]>(`/items?${query}`);
    if (!response.ok || !Array.isArray(response.body)) continue;
    for (const entry of response.body) {
      if (entry.code === 200 && entry.body?.id) liveItems.set(entry.body.id, entry.body);
    }
  }

  return result.rows.map((row) => {
    const saved = (row.raw_response?.item ?? row.raw_response ?? {}) as MercadoLivreItem;
    const live = liveItems.get(String(row.external_id));
    const item = live ?? saved;
    return {
      offerId: String(row.offer_id),
      itemId: String(row.external_id),
      productId: String(row.product_id),
      productTitle: String(row.product_title),
      productSku: String(row.product_sku),
      externalSku: String(row.external_sku),
      variation: variationLabel(row.attributes ?? {}),
      unitsPerPack: Number(row.units_per_pack),
      title: String(item.title ?? row.product_title),
      status: String(item.status ?? "unknown"),
      subStatus: Array.isArray(item.sub_status) ? item.sub_status.map(String) : [],
      price: Number(item.price ?? 0),
      availableQuantity: Number(item.available_quantity ?? 0),
      imageUrl: item.pictures?.[0]?.secure_url ?? item.pictures?.[0]?.url ?? item.thumbnail ?? row.local_image ?? null,
      permalink: item.permalink ?? null,
      familyName: item.family_name ?? null,
      userProductId: item.user_product_id ?? null,
      lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
      live: Boolean(live),
    };
  });
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
  const existing = await pool.query(
    `SELECT id, raw_response FROM scx_catalog_marketplace_offers
      WHERE channel='mercado_livre' AND external_id=$1 LIMIT 1`,
    [itemId],
  );
  if (!existing.rows[0]) throw new Error("Anuncio nao pertence ao catalogo gerenciado pela SCX.");

  let response;
  if (action === "pause" || action === "activate") {
    const status = action === "pause" ? "paused" : "active";
    response = await updateItem(itemId, { status });
    if (!response.ok) throw new Error(apiError(response.body, `Mercado Livre recusou o status ${status}.`));
  } else {
    const current = await mercadoLivreRequest<MercadoLivreItem>(`/items/${itemId}`);
    if (!current.ok) throw new Error(apiError(current.body, "Nao foi possivel consultar o anuncio antes da exclusao."));
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

  const saved = existing.rows[0].raw_response ?? {};
  const syncStatus = action === "activate" ? "synced" : "disabled";
  await pool.query(
    `UPDATE scx_catalog_marketplace_offers
        SET sync_status=$2, last_synced_at=now(), raw_response=$3::jsonb, updated_at=now()
      WHERE id=$1`,
    [existing.rows[0].id, syncStatus, JSON.stringify({ ...saved, item: response.body })],
  );
  return response.body;
}
