import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { generateMercadoLivreDraft, getMercadoLivreDraft } from "@/domain/mercadoLivre/publishingRepository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 });
  if (!roleCan(session.role, "catalog:publish")) return NextResponse.json({ ok: false, message: "Sem permissao para publicar." }, { status: 403 });
  const productId = new URL(request.url).searchParams.get("productId");
  if (!productId) return NextResponse.json({ ok: false, message: "Escolha um produto." }, { status: 400 });
  const draft = await getMercadoLivreDraft(productId);
  return NextResponse.json({ ok: true, draft });
}

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 });
  if (!roleCan(session.role, "catalog:publish")) return NextResponse.json({ ok: false, message: "Sem permissao para publicar." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body?.productId) return NextResponse.json({ ok: false, message: "Escolha um produto." }, { status: 400 });
  try {
    const draft = await generateMercadoLivreDraft(String(body.productId), session.id);
    return NextResponse.json({ ok: true, message: "Previa gerada com dados confirmados.", draft });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao gerar previa." }, { status: 400 });
  }
}
