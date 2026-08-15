import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { buildAuthorizationUrl, createOAuthState, createPkce } from "@/domain/mercadoLivre/core.js";
import { mercadoLivreConfig } from "@/domain/mercadoLivre/oauth";
import { saveOAuthState } from "@/domain/mercadoLivre/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.redirect(new URL("/admin/login", process.env.MERCADO_LIVRE_REDIRECT_URI));
  if (!roleCan(session.role, "supplier:import")) {
    return NextResponse.redirect(new URL("/admin/mercado-livre?erro=permissao", process.env.MERCADO_LIVRE_REDIRECT_URI));
  }
  const config = mercadoLivreConfig();
  const state = createOAuthState();
  const pkce = createPkce();
  await saveOAuthState({ state, codeVerifier: pkce.verifier, adminUserId: session.id });
  return NextResponse.redirect(buildAuthorizationUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    challenge: pkce.challenge,
  }));
}
