import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { syncCatalogProductToOlistIfEnabled } from "@/domain/olist/repository";

export async function POST(request: Request) {
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

    const body = await request.json().catch(() => null);
    const productId = String(body?.productId ?? "").trim();
    if (!productId) {
      return NextResponse.json(
        { ok: false, message: "Produto nao informado." },
        { status: 400 },
      );
    }

    const result = await syncCatalogProductToOlistIfEnabled(productId);
    await writeAdminAuditLog({
      actorUserId: session.id,
      action: "catalog_product_updated",
      entityType: "catalog_product",
      entityId: productId,
      summary: `Envio individual Olist: ${result.message}`,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel enviar o produto ao Olist.",
      },
      { status: 500 },
    );
  }
}
