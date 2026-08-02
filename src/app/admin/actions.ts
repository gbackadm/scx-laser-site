"use server";

import { redirect } from "next/navigation";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import {
  getCurrentAdminSession,
  revokeCurrentAdminSession,
} from "@/domain/auth/session";

export async function logoutAdmin() {
  const session = await getCurrentAdminSession();

  if (session) {
    await writeAdminAuditLog({
      actorUserId: session.id,
      action: "admin_logout",
      entityType: "user",
      entityId: session.id,
      summary: "Logout administrativo realizado.",
    });
  }

  await revokeCurrentAdminSession();
  redirect("/admin/login?logout=1");
}
