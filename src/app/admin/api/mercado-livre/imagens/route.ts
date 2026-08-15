import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { uploadMercadoLivreCatalogImage } from "@/domain/mercadoLivre/publishingRepository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 });
  if (!roleCan(session.role, "catalog:publish")) return NextResponse.json({ ok: false, message: "Sem permissao para alterar imagens." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const productId = String(form?.get("productId") ?? "");
  const variantId = String(form?.get("variantId") ?? "").trim() || null;
  const file = form?.get("file");
  if (!productId || !(file instanceof File)) return NextResponse.json({ ok: false, message: "Escolha uma imagem." }, { status: 400 });
  try {
    const result = await uploadMercadoLivreCatalogImage(productId, variantId, file);
    return NextResponse.json({ ok: true, message: variantId ? "Imagem adicionada a variacao." : "Imagem adicionada ao produto pai.", ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao enviar imagem." }, { status: 400 });
  }
}
