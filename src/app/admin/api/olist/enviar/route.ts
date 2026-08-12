import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { executeOlistSync } from "@/domain/olist/repository";

export async function POST() {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json(
        { ok: false, message: "Sua sessao expirou. Entre no painel novamente." },
        { status: 401 },
      );
    }

    if (!roleCan(session.role, "supplier:import")) {
      return NextResponse.json(
        { ok: false, message: "Seu usuario nao pode enviar produtos ao Olist." },
        { status: 403 },
      );
    }

    const result = await executeOlistSync({
      actorUserId: session.id,
      triggerSource: "admin",
    });

    await writeAdminAuditLog({
      actorUserId: session.id,
      action: "catalog_product_updated",
      entityType: "catalog_product",
      entityId: "olist",
      summary: `Envio Olist: ${result.sentProducts} enviados e ${result.failedProducts} com erro.`,
    });

    return NextResponse.json({
      ok: result.failedProducts === 0,
      message:
        result.failedProducts > 0
          ? `${result.sentProducts} enviados e ${result.failedProducts} com erro.`
          : `${result.sentProducts} produto(s) enviados ao Olist.`,
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel enviar os produtos ao Olist agora.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
