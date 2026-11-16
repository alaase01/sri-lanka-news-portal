import { NextResponse, type NextRequest } from "next/server";
import { adminCsp } from "@/config/security-headers";

/**
 * Runs before every /admin request.
 *
 * 1. Gives each admin page a fresh nonce and a strict Content Security Policy,
 *    so only scripts Next.js itself rendered for this response can run.
 * 2. Sends visitors without a session cookie straight to the login page. This
 *    is a convenience only: the real check is requireAdmin() on every page and
 *    server action, which also rejects expired or forged sessions.
 */

const ADMIN_COOKIE = process.env.NODE_ENV === "production" ? "__Host-rs_admin" : "rs_admin";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/admin/login";

  if (!isLogin && !request.cookies.has(ADMIN_COOKIE)) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = adminCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
