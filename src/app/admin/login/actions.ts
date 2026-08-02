"use server";

import { redirect } from "next/navigation";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { verifyPassword } from "@/domain/auth/password";
import { createAdminSession } from "@/domain/auth/session";
import { getDatabasePool } from "@/domain/catalog/db";

export async function loginAdmin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/admin/login?erro=campos");
  }

  let result;
  try {
    result = await getDatabasePool().query(
      `
        SELECT id, email, password_hash, is_active
        FROM scx_catalog_admin_users
        WHERE lower(email) = $1
        LIMIT 1
      `,
      [email],
    );
  } catch (error) {
    console.error("Erro ao consultar usuario administrativo.", error);
    redirect("/admin/login?erro=banco");
  }
  const user = result.rows[0];
  const passwordMatches =
    user?.password_hash && (await verifyPassword(password, user.password_hash));

  if (!user || !user.is_active || !passwordMatches) {
    try {
      await writeAdminAuditLog({
        action: "admin_login_failed",
        entityType: "user",
        entityId: user?.id ?? email,
        summary: "Tentativa de login administrativo recusada.",
      });
    } catch (error) {
      console.error("Erro ao auditar tentativa de login recusada.", error);
    }
    redirect("/admin/login?erro=credenciais");
  }

  try {
    await createAdminSession(user.id);
    await getDatabasePool().query(
      `
        UPDATE scx_catalog_admin_users
        SET last_login_at = now()
        WHERE id = $1
      `,
      [user.id],
    );
    await writeAdminAuditLog({
      actorUserId: user.id,
      action: "admin_login_succeeded",
      entityType: "user",
      entityId: user.id,
      summary: "Login administrativo realizado.",
    });
  } catch (error) {
    console.error("Erro ao criar sessao administrativa.", error);
    redirect("/admin/login?erro=banco");
  }

  redirect("/admin/catalogo");
}
