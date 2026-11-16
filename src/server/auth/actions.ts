"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout } from "./core";
import { clearSessionCookie, readSessionToken, requestMeta, setSessionCookie } from "./session";

/*
 * Server actions for signing in and out. Next.js rejects a server action whose
 * Origin does not match the site's host, and the session cookie is
 * SameSite=Strict, so another site cannot submit these on the administrator's behalf.
 */

export type LoginState = { error: string | null; email: string };

const input = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(1024),
});

export async function loginAction(_previous: LoginState, form: FormData): Promise<LoginState> {
  const parsed = input.safeParse({ email: form.get("email"), password: form.get("password") });
  const email = typeof form.get("email") === "string" ? String(form.get("email")).slice(0, 254) : "";
  if (!parsed.success) return { error: "Enter your email and password.", email };

  const result = await login(parsed.data.email, parsed.data.password, await requestMeta(), new Date());
  if (!result.ok) {
    return {
      error:
        result.code === "rate_limited"
          ? "Too many failed attempts. Wait 15 minutes, then try again."
          : "The email or password is incorrect.",
      email,
    };
  }
  await setSessionCookie(result.token);
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await logout(await readSessionToken(), await requestMeta());
  await clearSessionCookie();
  redirect("/admin/login");
}
