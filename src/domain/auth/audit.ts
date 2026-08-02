import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabasePool } from "@/domain/catalog/db";
import type { AuditLogEntry } from "@/domain/catalog/types";

export async function writeAdminAuditLog(
  entry: Omit<AuditLogEntry, "id" | "occurredAt">,
) {
  await getDatabasePool().query(
    `
      INSERT INTO scx_catalog_audit_log (
        id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        summary
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      randomUUID(),
      entry.actorUserId ?? null,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.summary,
    ],
  );
}
