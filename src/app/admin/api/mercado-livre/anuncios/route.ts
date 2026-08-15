import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { changeManagedMercadoLivreListing } from "@/domain/mercadoLivre/listingsRepository";

const actions = new Set(["pause", "activate", "delete"]);

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 });
  if (!roleCan(session.role, "catalog:publish")) return NextResponse.json({ ok: false, message: "Sem permissao para gerenciar anuncios." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const itemId = String(body?.itemId ?? "");
  const action = String(body?.action ?? "");
  if (!/^MLB\d+$/.test(itemId) || !actions.has(action) || body?.confirmed !== true) {
    return NextResponse.json({ ok: false, message: "Solicitacao de alteracao invalida." }, { status: 400 });
  }
  try {
    const item = await changeManagedMercadoLivreListing(itemId, action as "pause" | "activate" | "delete");
    const labels = { pause: "pausado", activate: "reativado", delete: "excluido" } as const;
    await writeAdminAuditLog({
      actorUserId: session.id,
      action: "catalog_product_updated",
      entityType: "catalog_product",
      entityId: itemId,
      summary: `Anuncio ${itemId} ${labels[action as keyof typeof labels]} no Mercado Livre.`,
    });
    return NextResponse.json({ ok: true, message: `Anuncio ${labels[action as keyof typeof labels]} com sucesso.`, item });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Nao foi possivel alterar o anuncio." }, { status: 400 });
  }
}
