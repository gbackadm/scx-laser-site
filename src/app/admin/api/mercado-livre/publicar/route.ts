import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { publishMercadoLivreDraft } from "@/domain/mercadoLivre/publishingRepository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 });
  if (!roleCan(session.role, "catalog:publish")) return NextResponse.json({ ok: false, message: "Sem permissao para publicar." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body?.productId || body?.confirmed !== true || !Number.isInteger(body?.unitsPerPack)) {
    return NextResponse.json({ ok: false, message: "Confirme conscientemente a publicacao real." }, { status: 400 });
  }
  try {
    const result = await publishMercadoLivreDraft(String(body.productId), Number(body.unitsPerPack));
    await writeAdminAuditLog({
      actorUserId: session.id,
      action: "catalog_product_updated",
      entityType: "catalog_product",
      entityId: String(body.productId),
      summary: `Familia de ${body.unitsPerPack} unidade(s) publicada diretamente no Mercado Livre: ${result.published.length} item(ns).`,
    });
    return NextResponse.json({ ok: true, message: `${result.published.length} variacao(oes) publicadas no Mercado Livre.`, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao publicar." }, { status: 502 });
  }
}
