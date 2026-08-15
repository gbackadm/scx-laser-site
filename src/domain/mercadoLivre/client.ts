import "server-only";

import { getValidMercadoLivreAccessToken } from "./repository";

export async function mercadoLivreRequest<T>(path: string, init: RequestInit = {}) {
  const token = await getValidMercadoLivreAccessToken();
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body: body as T };
}

export function validateMercadoLivreItem(payload: unknown) {
  return mercadoLivreRequest<unknown>("/items/validate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createMercadoLivreItem(payload: unknown) {
  return mercadoLivreRequest<{ id: string; user_product_id?: string; permalink?: string }>("/items", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createMercadoLivreDescription(itemId: string, description: string) {
  return mercadoLivreRequest<unknown>(`/items/${itemId}/description`, {
    method: "POST",
    body: JSON.stringify({ plain_text: description }),
  });
}
