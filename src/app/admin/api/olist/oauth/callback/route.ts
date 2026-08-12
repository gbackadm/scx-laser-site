import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdminSession } from "@/domain/auth/session";
import {
  exchangeOlistAuthorizationCode,
  getOlistRedirectUri,
} from "@/domain/olist/oauth";

export async function GET(request: NextRequest) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.redirect(new URL("/admin/login", request.url));

  const expectedState = request.cookies.get("scx_olist_oauth_state")?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error_description") ??
    request.nextUrl.searchParams.get("error");

  const destination = new URL("/admin/olist", request.url);
  if (error || !code || !state || !expectedState || state !== expectedState) {
    destination.searchParams.set("erro", error ? "oauth" : "oauth_estado");
    const response = NextResponse.redirect(destination);
    response.cookies.delete("scx_olist_oauth_state");
    return response;
  }

  try {
    await exchangeOlistAuthorizationCode({
      code,
      redirectUri: getOlistRedirectUri(request.nextUrl.origin),
      connectedBy: session.id,
    });
    destination.searchParams.set("conectado", "1");
  } catch (exchangeError) {
    console.error("Nao foi possivel concluir a autorizacao Olist.", exchangeError);
    destination.searchParams.set("erro", "oauth_token");
  }

  const response = NextResponse.redirect(destination);
  response.cookies.delete("scx_olist_oauth_state");
  return response;
}

