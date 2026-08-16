import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { syncMercadoLivreStock } from "@/domain/mercadoLivre/listingsRepository";

export const runtime = "nodejs";
export const maxDuration = 300;

function hasCronAccess(request: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.MERCADO_LIVRE_CRON_SECRET;
  return Boolean(secret) && (
    request.headers.get("authorization") === `Bearer ${secret}`
    || request.headers.get("x-mercado-livre-cron-secret") === secret
  );
}

async function run() {
  try {
    const summary = await syncMercadoLivreStock();
    return NextResponse.json({ ok: true, message: "Estoque do Mercado Livre sincronizado.", summary });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : "Falha ao sincronizar estoque.",
    }, { status: 500 });
  }
}

export async function POST() {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 });
  if (!roleCan(session.role, "catalog:publish")) {
    return NextResponse.json({ ok: false, message: "Sem permissao para sincronizar anuncios." }, { status: 403 });
  }
  return run();
}

export async function GET(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ ok: false, message: "Rotina Mercado Livre nao autorizada." }, { status: 401 });
  }
  return run();
}
