import { randomBytes } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import {
  buildOlistAuthorizationUrl,
  getOlistRedirectUri,
} from "@/domain/olist/oauth";

export async function GET(request: NextRequest) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.redirect(new URL("/admin/login", request.url));
  if (!roleCan(session.role, "supplier:import")) {
    return NextResponse.redirect(new URL("/admin/olist?erro=permissao", request.url));
  }

  const state = randomBytes(32).toString("base64url");
  const redirectUri = getOlistRedirectUri(request.nextUrl.origin);
  const response = NextResponse.redirect(
    buildOlistAuthorizationUrl({ redirectUri, state }),
  );
  response.cookies.set("scx_olist_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}

