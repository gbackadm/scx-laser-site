import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { getDatabasePool } from "@/domain/catalog/db";

const OLIST_TOKEN_URL =
  "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";

type OlistTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  scope?: string;
};

type OlistCredentialRow = {
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  access_token_expires_at: Date | string;
  refresh_token_expires_at: Date | string;
  scope: string | null;
};

function requiredEnv(name: "OLIST_CLIENT_ID" | "OLIST_CLIENT_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} nao configurado.`);
  return value;
}

function encryptionKey() {
  return createHash("sha256")
    .update(`${requiredEnv("OLIST_CLIENT_ID")}:${requiredEnv("OLIST_CLIENT_SECRET")}`)
    .digest();
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decryptToken(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Credencial Olist armazenada em formato invalido.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function tokenExpiry(seconds: number | undefined, fallbackSeconds: number) {
  const ttl = Number.isFinite(seconds) && Number(seconds) > 0
    ? Number(seconds)
    : fallbackSeconds;
  return new Date(Date.now() + ttl * 1000);
}

async function requestTokens(params: Record<string, string>) {
  const response = await fetch(OLIST_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as
    | (Partial<OlistTokenResponse> & { error?: string; error_description?: string })
    | null;

  if (!response.ok || !body?.access_token || !body.refresh_token) {
    throw new Error(
      body?.error_description ?? body?.error ??
        `Olist recusou a autorizacao (HTTP ${response.status}).`,
    );
  }

  return body as OlistTokenResponse;
}

async function persistTokens(tokens: OlistTokenResponse, connectedBy?: string) {
  await getDatabasePool().query(
    `
      INSERT INTO scx_olist_oauth_credentials (
        id,
        encrypted_access_token,
        encrypted_refresh_token,
        access_token_expires_at,
        refresh_token_expires_at,
        scope,
        connected_by,
        updated_at
      )
      VALUES ('default', $1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (id)
      DO UPDATE SET
        encrypted_access_token = EXCLUDED.encrypted_access_token,
        encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
        access_token_expires_at = EXCLUDED.access_token_expires_at,
        refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
        scope = EXCLUDED.scope,
        connected_by = COALESCE(EXCLUDED.connected_by, scx_olist_oauth_credentials.connected_by),
        updated_at = now()
    `,
    [
      encryptToken(tokens.access_token),
      encryptToken(tokens.refresh_token),
      tokenExpiry(tokens.expires_in, 4 * 60 * 60),
      tokenExpiry(tokens.refresh_expires_in, 24 * 60 * 60),
      tokens.scope ?? null,
      connectedBy ?? null,
    ],
  );
}

export function isOlistOAuthConfigured() {
  return Boolean(process.env.OLIST_CLIENT_ID && process.env.OLIST_CLIENT_SECRET);
}

export function getOlistRedirectUri(origin: string) {
  return (
    process.env.OLIST_REDIRECT_URI?.trim() ||
    `${origin}/admin/api/olist/oauth/callback`
  );
}

export function buildOlistAuthorizationUrl({
  redirectUri,
  state,
}: {
  redirectUri: string;
  state: string;
}) {
  const url = new URL(
    "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth",
  );
  url.search = new URLSearchParams({
    client_id: requiredEnv("OLIST_CLIENT_ID"),
    redirect_uri: redirectUri,
    scope: "openid",
    response_type: "code",
    state,
  }).toString();
  return url;
}

export async function exchangeOlistAuthorizationCode({
  code,
  redirectUri,
  connectedBy,
}: {
  code: string;
  redirectUri: string;
  connectedBy: string;
}) {
  const tokens = await requestTokens({
    grant_type: "authorization_code",
    client_id: requiredEnv("OLIST_CLIENT_ID"),
    client_secret: requiredEnv("OLIST_CLIENT_SECRET"),
    redirect_uri: redirectUri,
    code,
  });
  await persistTokens(tokens, connectedBy);
}

async function loadCredentials() {
  const { rows } = await getDatabasePool().query<OlistCredentialRow>(`
    SELECT encrypted_access_token, encrypted_refresh_token,
      access_token_expires_at, refresh_token_expires_at, scope
    FROM scx_olist_oauth_credentials
    WHERE id = 'default'
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function getOlistConnectionStatus() {
  if (!isOlistOAuthConfigured()) {
    return { configured: false, connected: false } as const;
  }

  const credentials = await loadCredentials();
  return {
    configured: true,
    connected:
      Boolean(credentials) &&
      new Date(credentials.refresh_token_expires_at).getTime() > Date.now(),
    accessExpiresAt: credentials
      ? new Date(credentials.access_token_expires_at).toISOString()
      : undefined,
    refreshExpiresAt: credentials
      ? new Date(credentials.refresh_token_expires_at).toISOString()
      : undefined,
  };
}

export async function getOlistAccessToken() {
  const credentials = await loadCredentials();
  if (!credentials) throw new Error("Conecte a conta Olist no painel.");

  if (new Date(credentials.access_token_expires_at).getTime() > Date.now() + 60_000) {
    return decryptToken(credentials.encrypted_access_token);
  }

  if (new Date(credentials.refresh_token_expires_at).getTime() <= Date.now()) {
    throw new Error("A autorizacao Olist expirou. Conecte a conta novamente.");
  }

  const tokens = await requestTokens({
    grant_type: "refresh_token",
    client_id: requiredEnv("OLIST_CLIENT_ID"),
    client_secret: requiredEnv("OLIST_CLIENT_SECRET"),
    refresh_token: decryptToken(credentials.encrypted_refresh_token),
  });
  await persistTokens(tokens);
  return tokens.access_token;
}

