import "server-only";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { authConfig } from "@/config/auth";
import { clientIp, networkHash } from "@/server/polls/device";
import { validateSession, type AdminIdentity, type RequestMeta } from "./core";

/**
 * Glue between the session logic and Next.js requests.
 *
 * Every admin page and every admin server action must call `requireAdmin()`
 * first. The proxy's redirect for /admin is only a convenience; this is the check.
 */

export const ADMIN_COOKIE = process.env.NODE_ENV === "production" ? "__Host-rs_admin" : "rs_admin";

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = clientIp(h);
  return { ip, userAgent: h.get("user-agent"), networkHash: networkHash(ip, new Date()) };
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(ADMIN_COOKIE)?.value;
}

const cookieAttributes = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  // Strict: the cookie is never sent on requests started by another site.
  sameSite: "strict",
  path: "/",
} as const;

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, token, { ...cookieAttributes, maxAge: authConfig.absoluteTimeoutDays * 86_400 });
}

export async function clearSessionCookie(): Promise<void> {
  // Browsers only accept the removal of a __Host- cookie when it carries the same
  // Secure and path attributes it was set with, so expire it explicitly.
  (await cookies()).set(ADMIN_COOKIE, "", { ...cookieAttributes, maxAge: 0 });
}

/** The signed-in administrator, or null. Cached for the duration of one request. */
export const currentAdmin = cache(async (): Promise<AdminIdentity | null> => {
  // Session checks depend on the request and the current time; never prerender them.
  await connection();
  return validateSession(await readSessionToken(), new Date());
});

/** The signed-in administrator; redirects to the login page when there is none. */
export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
