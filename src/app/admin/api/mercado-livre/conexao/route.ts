import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { getMercadoLivreUser } from "@/domain/mercadoLivre/oauth";
import { getValidMercadoLivreAccessToken } from "@/domain/mercadoLivre/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.redirect(new URL("/admin/login", request.url));
  if (!roleCan(session.role, "supplier:import")) {
    return NextResponse.redirect(new URL("/admin/mercado-livre?erro=permissao", request.url));
  }
  try {
    const accessToken = await getValidMercadoLivreAccessToken();
    await getMercadoLivreUser(accessToken);
    return NextResponse.redirect(new URL("/admin/mercado-livre?testada=1", request.url));
  } catch (error) {
    console.error("Falha no teste Mercado Livre", error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL("/admin/mercado-livre?erro=teste_conexao", request.url));
  }
}
