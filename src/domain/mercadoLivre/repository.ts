import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabasePool } from "@/domain/catalog/db";
import {
  decryptSecret,
  encryptSecret,
  hashOAuthState,
} from "@/domain/mercadoLivre/core.js";
import { refreshMercadoLivreToken } from "@/domain/mercadoLivre/oauth";

function encryptionSecret() {
  const secret = process.env.MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("Criptografia do Mercado Livre nao configurada.");
  return secret;
}

export type MercadoLivreToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id: number;
  refresh_token: string;
};

export async function saveOAuthState(input: {
  state: string;
  codeVerifier: string;
  adminUserId: string;
}) {
  await getDatabasePool().query(
    `INSERT INTO scx_mercado_livre_oauth_states
      (state_hash, encrypted_code_verifier, admin_user_id, expires_at)
     VALUES ($1, $2, $3, now() + interval '10 minutes')`,
    [
      hashOAuthState(input.state),
      encryptSecret(input.codeVerifier, encryptionSecret()),
      input.adminUserId,
    ],
  );
}

export async function consumeOAuthState(state: string) {
  const result = await getDatabasePool().query(
    `UPDATE scx_mercado_livre_oauth_states
       SET used_at = now()
     WHERE state_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING encrypted_code_verifier, admin_user_id`,
    [hashOAuthState(state)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    codeVerifier: decryptSecret(row.encrypted_code_verifier, encryptionSecret()),
    adminUserId: String(row.admin_user_id),
  };
}

export async function saveMercadoLivreAccount(input: {
  token: MercadoLivreToken;
  nickname?: string;
  siteId?: string;
  adminUserId: string;
}) {
  const { token } = input;
  await getDatabasePool().query(
    `INSERT INTO scx_mercado_livre_accounts (
       id, mercado_livre_user_id, nickname, site_id,
       encrypted_access_token, encrypted_refresh_token, token_type, scopes,
       expires_at, status, connected_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now() + ($9::int * interval '1 second'),'active',$10)
     ON CONFLICT (mercado_livre_user_id) DO UPDATE SET
       nickname = EXCLUDED.nickname,
       site_id = EXCLUDED.site_id,
       encrypted_access_token = EXCLUDED.encrypted_access_token,
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
       token_type = EXCLUDED.token_type,
       scopes = EXCLUDED.scopes,
       expires_at = EXCLUDED.expires_at,
       status = 'active',
       last_error = NULL,
       connected_by = EXCLUDED.connected_by,
       connected_at = now(),
       updated_at = now()`,
    [
      randomUUID(),
      String(token.user_id),
      input.nickname ?? null,
      input.siteId ?? "MLB",
      encryptSecret(token.access_token, encryptionSecret()),
      encryptSecret(token.refresh_token, encryptionSecret()),
      token.token_type || "bearer",
      token.scope ?? null,
      token.expires_in,
      input.adminUserId,
    ],
  );
}

export async function getMercadoLivreConnection() {
  const result = await getDatabasePool().query(
    `SELECT mercado_livre_user_id, nickname, site_id, scopes, expires_at,
            status, connected_at, refreshed_at, updated_at, last_error
       FROM scx_mercado_livre_accounts
      ORDER BY updated_at DESC LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) return null;
  const date = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : null;
  return {
    userId: String(row.mercado_livre_user_id),
    nickname: row.nickname ? String(row.nickname) : null,
    siteId: String(row.site_id),
    scopes: row.scopes ? String(row.scopes) : null,
    status: String(row.status),
    expiresAt: date(row.expires_at),
    connectedAt: date(row.connected_at),
    refreshedAt: date(row.refreshed_at),
    updatedAt: date(row.updated_at),
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

export async function saveMercadoLivreNotification(input: {
  id: string;
  applicationId: string;
  userId: string;
  topic: string;
  resource: string;
  actions: unknown[];
  attempts: number;
  sentAt?: string;
  payload: unknown;
  accepted: boolean;
}) {
  await getDatabasePool().query(
    `INSERT INTO scx_mercado_livre_notifications (
       id, application_id, mercado_livre_user_id, topic, resource,
       actions, attempts, sent_at, payload, status
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10)
     ON CONFLICT (id) DO UPDATE SET attempts = GREATEST(scx_mercado_livre_notifications.attempts, EXCLUDED.attempts)`,
    [
      input.id,
      input.applicationId,
      input.userId,
      input.topic,
      input.resource,
      JSON.stringify(input.actions),
      input.attempts,
      input.sentAt ?? null,
      JSON.stringify(input.payload),
      input.accepted ? "pending" : "ignored",
    ],
  );
}

export async function getMercadoLivreSyncOverview() {
  const [notificationResult, offerResult] = await Promise.all([
    getDatabasePool().query(
      `SELECT count(*) FILTER (WHERE status='pending')::int AS pending_events,
              count(*) FILTER (WHERE status='failed')::int AS failed_events,
              max(received_at) AS last_event_at
         FROM scx_mercado_livre_notifications`,
    ),
    getDatabasePool().query(
      `SELECT count(*) FILTER (WHERE sync_status='failed' OR last_stock_sync_error IS NOT NULL)::int AS failed_offers,
              max(last_stock_sync_at) AS last_stock_sync_at
         FROM scx_catalog_marketplace_offers
        WHERE channel='mercado_livre' AND external_id IS NOT NULL`,
    ),
  ]);
  const notification = notificationResult.rows[0] ?? {};
  const offer = offerResult.rows[0] ?? {};
  const date = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : null;
  return {
    pendingEvents: Number(notification.pending_events ?? 0),
    failedEvents: Number(notification.failed_events ?? 0),
    failedOffers: Number(offer.failed_offers ?? 0),
    lastEventAt: date(notification.last_event_at),
    lastStockSyncAt: date(offer.last_stock_sync_at),
  };
}

export async function markPendingMercadoLivreNotificationsProcessed() {
  const result = await getDatabasePool().query(
    `UPDATE scx_mercado_livre_notifications
        SET status='processed', processed_at=now(), error_message=NULL
      WHERE status='pending'`,
  );
  return result.rowCount ?? 0;
}

export async function getValidMercadoLivreAccessToken() {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, encrypted_access_token, encrypted_refresh_token, expires_at
         FROM scx_mercado_livre_accounts
        WHERE status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
        FOR UPDATE`,
    );
    const row = result.rows[0];
    if (!row) throw new Error("Nenhuma conta Mercado Livre conectada.");

    const expiresAt = new Date(row.expires_at).getTime();
    if (expiresAt > Date.now() + 5 * 60 * 1000) {
      const accessToken = decryptSecret(row.encrypted_access_token, encryptionSecret());
      await client.query("COMMIT");
      return accessToken;
    }

    const refreshToken = decryptSecret(row.encrypted_refresh_token, encryptionSecret());
    const token = await refreshMercadoLivreToken(refreshToken);
    await client.query(
      `UPDATE scx_mercado_livre_accounts SET
         encrypted_access_token = $2,
         encrypted_refresh_token = $3,
         token_type = $4,
         scopes = $5,
         expires_at = now() + ($6::int * interval '1 second'),
         refreshed_at = now(),
         updated_at = now(),
         last_error = NULL
       WHERE id = $1`,
      [
        row.id,
        encryptSecret(token.access_token, encryptionSecret()),
        encryptSecret(token.refresh_token, encryptionSecret()),
        token.token_type || "bearer",
        token.scope ?? null,
        token.expires_in,
      ],
    );
    await client.query("COMMIT");
    return token.access_token;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
