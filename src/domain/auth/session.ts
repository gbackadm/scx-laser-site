import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDatabasePool, isDatabaseConfigured } from "@/domain/catalog/db";
import type { AdminUser, UserRole } from "@/domain/catalog/types";

export const adminSessionCookieName = "scx_admin_session";
const sessionTtlSeconds = 60 * 60 * 8;

export type AuthenticatedAdmin = AdminUser & {
  sessionId: string;
  expiresAt: string;
};

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/admin",
    maxAge: sessionTtlSeconds,
  };
}

export async function createAdminSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const sessionId = randomUUID();

  await getDatabasePool().query(
    `
      INSERT INTO scx_catalog_admin_sessions (
        id,
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3, now() + ($4::int * interval '1 second'))
    `,
    [sessionId, userId, tokenHash, sessionTtlSeconds],
  );

  const cookieStore = await cookies();
  cookieStore.set(adminSessionCookieName, token, getCookieOptions());
}

export async function getCurrentAdminSession() {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookieName)?.value;

  if (!token) {
    return null;
  }

  let result;
  try {
    result = await getDatabasePool().query(
      `
        SELECT
          s.id AS session_id,
          s.expires_at,
          u.id,
          u.name,
          u.email,
          u.role,
          u.is_active
        FROM scx_catalog_admin_sessions s
        INNER JOIN scx_catalog_admin_users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.is_active = true
        LIMIT 1
      `,
      [hashSessionToken(token)],
    );
  } catch (error) {
    console.error("Nao foi possivel carregar a sessao administrativa.", error);
    return null;
  }

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  try {
    await getDatabasePool().query(
      `
        UPDATE scx_catalog_admin_sessions
        SET last_seen_at = now()
        WHERE id = $1
      `,
      [row.session_id],
    );
  } catch (error) {
    console.error("Nao foi possivel atualizar a sessao administrativa.", error);
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as UserRole,
    isActive: row.is_active,
    sessionId: row.session_id,
    expiresAt:
      row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : String(row.expires_at),
  } satisfies AuthenticatedAdmin;
}

export async function requireAdminSession() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return session;
}

export async function revokeCurrentAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookieName)?.value;

  if (token && isDatabaseConfigured()) {
    try {
      await getDatabasePool().query(
        `
          UPDATE scx_catalog_admin_sessions
          SET revoked_at = now()
          WHERE token_hash = $1
            AND revoked_at IS NULL
        `,
        [hashSessionToken(token)],
      );
    } catch (error) {
      console.error("Nao foi possivel encerrar a sessao administrativa.", error);
    }
  }

  cookieStore.delete(adminSessionCookieName);
}
