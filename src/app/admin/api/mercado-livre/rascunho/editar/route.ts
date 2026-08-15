import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { editMercadoLivreDraft } from "@/domain/mercadoLivre/publishingRepository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 });
  if (!roleCan(session.role, "catalog:publish")) return NextResponse.json({ ok: false, message: "Sem permissao para publicar." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body?.productId || !Number.isInteger(body?.unitsPerPack) || !Array.isArray(body?.offers)) {
    return NextResponse.json({ ok: false, message: "Edicao do rascunho incompleta." }, { status: 400 });
  }
  try {
    const draft = await editMercadoLivreDraft({
      productId: String(body.productId),
      unitsPerPack: Number(body.unitsPerPack),
      familyName: String(body.familyName ?? ""),
      description: String(body.description ?? ""),
      listingTypeId: body.listingTypeId === "gold_pro" ? "gold_pro" : "gold_special",
      offers: body.offers.map((item: Record<string, unknown>) => ({
        offerId: String(item.offerId ?? ""),
        selected: item.selected === true,
        price: Number(item.price),
        pictureSources: Array.isArray(item.pictureSources) ? item.pictureSources.map(String) : [],
      })),
    });
    const selected = (draft?.payloads ?? []).filter((item) =>
      item.unitsPerPack === Number(body.unitsPerPack) && item.selectedForPublishing !== false
    );
    const blocked = selected.filter((item) => !item.publishable).length;
    const message = blocked
      ? `Custos recalculados. ${blocked} variacao(oes) ainda possuem bloqueios; veja os avisos em vermelho.`
      : `Custos recalculados. Agora valide ${selected.length} variacao(oes) no Mercado Livre.`;
    return NextResponse.json({ ok: true, message, draft });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao salvar alteracoes." }, { status: 400 });
  }
}
