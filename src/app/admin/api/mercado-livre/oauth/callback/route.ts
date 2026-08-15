import { NextResponse } from "next/server";

import { exchangeAuthorizationCode, getMercadoLivreUser } from "@/domain/mercadoLivre/oauth";
import { consumeOAuthState, saveMercadoLivreAccount } from "@/domain/mercadoLivre/repository";

export const runtime = "nodejs";

function adminRedirect(request: Request, query: string) {
  return NextResponse.redirect(new URL(`/admin/mercado-livre?${query}`, request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return adminRedirect(request, "erro=autorizacao_negada");
  if (!code || !state) return adminRedirect(request, "erro=callback_invalido");

  try {
    const savedState = await consumeOAuthState(state);
    if (!savedState) return adminRedirect(request, "erro=estado_invalido");
    const token = await exchangeAuthorizationCode(code, savedState.codeVerifier);
    const user = await getMercadoLivreUser(token.access_token);
    await saveMercadoLivreAccount({
      token,
      nickname: user.nickname,
      siteId: user.site_id,
      adminUserId: savedState.adminUserId,
    });
    return adminRedirect(request, "conectado=1");
  } catch (error) {
    console.error("Falha no callback Mercado Livre", error instanceof Error ? error.message : error);
    return adminRedirect(request, "erro=troca_token");
  }
}
