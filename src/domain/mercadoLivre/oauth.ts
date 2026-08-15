import "server-only";

import type { MercadoLivreToken } from "./repository";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} nao configurado.`);
  return value;
}

export function mercadoLivreConfig() {
  return {
    clientId: required("MERCADO_LIVRE_CLIENT_ID"),
    clientSecret: required("MERCADO_LIVRE_CLIENT_SECRET"),
    redirectUri: required("MERCADO_LIVRE_REDIRECT_URI"),
  };
}

export async function exchangeAuthorizationCode(code: string, codeVerifier: string) {
  const config = mercadoLivreConfig();
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new Error(`Mercado Livre recusou a autorizacao (${response.status}).`);
  }
  return body as MercadoLivreToken;
}

export async function refreshMercadoLivreToken(refreshToken: string) {
  const config = mercadoLivreConfig();
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new Error(`Mercado Livre recusou a renovacao (${response.status}).`);
  }
  return body as MercadoLivreToken;
}

export async function getMercadoLivreUser(accessToken: string) {
  const response = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Nao foi possivel identificar a conta (${response.status}).`);
  return response.json() as Promise<{ id: number; nickname?: string; site_id?: string }>;
}
