import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import {
  getManagedMercadoLivreListingEditor,
  updateManagedMercadoLivreListing,
} from "@/domain/mercadoLivre/listingsRepository";

export const runtime = "nodejs";

async function authorizedSession() {
  const session = await getCurrentAdminSession();
  if (!session) return { error: NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }) };
  if (!roleCan(session.role, "catalog:publish")) {
    return { error: NextResponse.json({ ok: false, message: "Sem permissao para editar anuncios." }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: Request) {
  const auth = await authorizedSession();
  if (auth.error) return auth.error;
  const itemId = new URL(request.url).searchParams.get("itemId") ?? "";
  if (!/^MLB\d+$/.test(itemId)) return NextResponse.json({ ok: false, message: "Anuncio invalido." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, editor: await getManagedMercadoLivreListingEditor(itemId) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao abrir o anuncio." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const auth = await authorizedSession();
  if (auth.error || !auth.session) return auth.error;
  const body = await request.json().catch(() => null);
  const itemId = String(body?.itemId ?? "");
  if (!/^MLB\d+$/.test(itemId) || !Array.isArray(body?.pictureSources)) {
    return NextResponse.json({ ok: false, message: "Edicao incompleta." }, { status: 400 });
  }
  try {
    const result = await updateManagedMercadoLivreListing({
      itemId,
      title: String(body.title ?? ""),
      price: Number(body.price),
      description: String(body.description ?? ""),
      pictureSources: body.pictureSources.map(String),
    });
    await writeAdminAuditLog({
      actorUserId: auth.session.id,
      action: "catalog_product_updated",
      entityType: "catalog_product",
      entityId: itemId,
      summary: `Anuncio ${itemId} editado no Mercado Livre.`,
    });
    return NextResponse.json({
      ok: true,
      message: result.warnings.length
        ? `Anuncio atualizado com aviso do Mercado Livre: ${result.warnings.join("; ")}`
        : "Anuncio atualizado no Mercado Livre.",
      item: result.item,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao editar o anuncio." }, { status: 400 });
  }
}
