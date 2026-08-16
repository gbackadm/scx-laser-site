import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import {
  saveMercadoLivreProductCategory,
  searchMercadoLivreCategories,
} from "@/domain/mercadoLivre/publishingRepository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 });
  if (!roleCan(session.role, "catalog:publish")) return NextResponse.json({ ok: false, message: "Sem permissao para publicar." }, { status: 403 });
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json({ ok: true, categories: await searchMercadoLivreCategories(query) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao buscar categorias." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 });
  if (!roleCan(session.role, "catalog:publish")) return NextResponse.json({ ok: false, message: "Sem permissao para publicar." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body?.productId || !body?.query || !body?.categoryId) {
    return NextResponse.json({ ok: false, message: "Escolha um produto e uma categoria sugerida." }, { status: 400 });
  }
  try {
    const category = await saveMercadoLivreProductCategory({
      productId: String(body.productId),
      query: String(body.query),
      categoryId: String(body.categoryId),
      actorUserId: session.id,
    });
    return NextResponse.json({ ok: true, message: "Categoria salva. Gere uma nova previa.", category });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao salvar categoria." }, { status: 400 });
  }
}
