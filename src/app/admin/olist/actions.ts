"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { requireAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import {
  updateOlistSettings,
  type OlistAutoSyncMode,
} from "@/domain/olist/repository";

function parseInteger(value: FormDataEntryValue | null, fallback: number) {
  const numericValue = Number(String(value ?? "").trim());

  return Number.isFinite(numericValue)
    ? Math.max(0, Math.round(numericValue))
    : fallback;
}

function parseBoolean(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

function parseAutoSyncMode(value: FormDataEntryValue | null): OlistAutoSyncMode {
  return value === "send" ? "send" : "simulation";
}

export async function saveOlistSettings(formData: FormData) {
  const session = await requireAdminSession();

  if (!roleCan(session.role, "supplier:import")) {
    redirect("/admin/olist?erro=permissao");
  }

  const settings = await updateOlistSettings({
    isEnabled: parseBoolean(formData.get("isEnabled")),
    defaultOrigin: String(formData.get("defaultOrigin") ?? "2"),
    batchSize: parseInteger(formData.get("batchSize"), 20),
    batchCallsPerMinute: parseInteger(formData.get("batchCallsPerMinute"), 5),
    autoSyncEnabled: parseBoolean(formData.get("autoSyncEnabled")),
    autoSyncIntervalMinutes: parseInteger(
      formData.get("autoSyncIntervalMinutes"),
      1440,
    ),
    autoSyncMode: parseAutoSyncMode(formData.get("autoSyncMode")),
    requireManualSimulationBeforeSend: parseBoolean(
      formData.get("requireManualSimulationBeforeSend"),
    ),
    actorUserId: session.id,
  });

  await writeAdminAuditLog({
    actorUserId: session.id,
    action: "catalog_product_updated",
    entityType: "catalog_product",
    entityId: "olist-settings",
    summary: `Configuracao Olist salva. Rotina ${
      settings.autoSyncEnabled ? "ativa" : "inativa"
    }.`,
  });

  revalidatePath("/admin/olist");
  redirect("/admin/olist?salvo=1");
}
