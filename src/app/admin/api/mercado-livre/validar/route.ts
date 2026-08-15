import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { validateMercadoLivreDraft } from "@/domain/mercadoLivre/publishingRepository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 });
  if (!roleCan(session.role, "catalog:publish")) return NextResponse.json({ ok: false, message: "Sem permissao para publicar." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body?.productId) return NextResponse.json({ ok: false, message: "Escolha um produto." }, { status: 400 });
  try {
    const unitsPerPack = Number(body.unitsPerPack);
    const draft = await validateMercadoLivreDraft(
      String(body.productId),
      Number.isInteger(unitsPerPack) ? unitsPerPack : undefined,
    );
    const ok = draft?.status === "validated";
    const warningCount = draft?.validationResults.reduce((total: number, result: unknown) => {
      const warnings = (result as { warnings?: unknown[] })?.warnings;
      return total + (Array.isArray(warnings) ? warnings.length : 0);
    }, 0) ?? 0;
    const successMessage = warningCount
      ? `As variacoes selecionadas passaram. O Mercado Livre retornou ${warningCount} aviso(s) nao bloqueante(s).`
      : "As variacoes selecionadas passaram no validador oficial.";
    return NextResponse.json({ ok, message: ok ? successMessage : draft?.errorMessage ?? "Validacao recusada.", draft }, { status: ok ? 200 : 422 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao validar." }, { status: 400 });
  }
}
