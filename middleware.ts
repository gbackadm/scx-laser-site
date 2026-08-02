import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const adminSessionCookieName = "scx_admin_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/api") &&
    pathname !== "/admin/login" &&
    !request.cookies.has(adminSessionCookieName)
  ) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
