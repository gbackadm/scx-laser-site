import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { simulateOlistSync } from "@/domain/olist/repository";

function parseLimit(value: unknown) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.round(numericValue)
    : undefined;
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentAdminSession();
    const body = await request.json().catch(() => null);

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          message: "Sua sessao expirou. Entre no painel de novo para simular.",
        },
        { status: 401 },
      );
    }

    if (!roleCan(session.role, "supplier:import")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Seu usuario nao tem permissao para simular envio Olist.",
        },
        { status: 403 },
      );
    }

    const simulation = await simulateOlistSync({
      limit: parseLimit(body?.limit),
      actorUserId: session.id,
      triggerSource: "admin",
      saveRun: true,
    });

    await writeAdminAuditLog({
      actorUserId: session.id,
      action: "catalog_product_updated",
      entityType: "catalog_product",
      entityId: "olist",
      summary: `Simulacao Olist: ${simulation.eligibleProducts}/${simulation.selectedProducts} elegiveis.`,
    });

    return NextResponse.json({
      ok: true,
      message:
        simulation.blockedProducts > 0
          ? `Simulacao pronta: ${simulation.eligibleProducts} elegiveis e ${simulation.blockedProducts} bloqueados.`
          : `Simulacao pronta: ${simulation.eligibleProducts} produto(s) elegiveis.`,
      simulation,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel simular o envio Olist agora.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
