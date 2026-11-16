import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { authConfig } from "@/config/auth";
import { env } from "@/config/env";
import { db } from "@/server/db/client";
import { dummyPasswordHash, isPlausibleEmail, normaliseEmail, verifyPassword } from "./password";
import { audit } from "./audit";

/**
 * Administrator sessions.
 *
 * A session is a 256-bit random token held in the administrator's cookie. The
 * database stores only its SHA-256, so a copy of the database cannot be used to
 * sign in. Sessions end after `idleTimeoutHours` without activity or
 * `absoluteTimeoutDays` after login, whichever comes first, and on logout.
 *
 * Functions take `now` so tests can control time.
 */

export type RequestMeta = { ip: string | null; userAgent: string | null; networkHash: string | null };

export type AdminIdentity = { id: string; email: string; sessionId: string };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Keyed hash so the attempts table cannot be matched against a list of email addresses. */
function emailHash(email: string): string {
  return createHmac("sha256", env.VOTE_SECRET).update(`login-email-v1\n${email}`).digest("hex");
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; adminId: string }
  | { ok: false; code: "invalid" | "rate_limited" };

async function recentFailures(where: { emailHash?: string; networkHash?: string }, since: Date): Promise<number> {
  // Failures only count after the most recent success for the same key, so
  // logging in correctly clears the counter.
  const lastSuccess = await db.loginAttempt.findFirst({
    where: { ...where, success: true, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return db.loginAttempt.count({
    where: { ...where, success: false, createdAt: { gte: lastSuccess?.createdAt ?? since } },
  });
}

export async function login(emailInput: string, password: string, meta: RequestMeta, now: Date): Promise<LoginResult> {
  const email = normaliseEmail(emailInput);
  const eHash = emailHash(email);
  const since = new Date(now.getTime() - authConfig.failureWindowMinutes * 60_000);

  const [accountFailures, networkFailures] = await Promise.all([
    recentFailures({ emailHash: eHash }, since),
    meta.networkHash ? recentFailures({ networkHash: meta.networkHash }, since) : Promise.resolve(0),
  ]);
  if (accountFailures >= authConfig.maxFailuresPerAccount || networkFailures >= authConfig.maxFailuresPerNetwork) {
    // Blocked attempts are not recorded, so the pause ends when the window passes.
    await audit({ action: "auth.login_blocked", ip: meta.ip, meta: { reason: "rate_limited" } });
    return { ok: false, code: "rate_limited" };
  }

  const admin = isPlausibleEmail(email) ? await db.admin.findUnique({ where: { email } }) : null;
  // Always run one Argon2 verification so a missing account takes as long as a wrong password.
  const valid = await verifyPassword(admin?.passwordHash ?? (await dummyPasswordHash()), password);

  await db.loginAttempt.create({
    data: { emailHash: eHash, networkHash: meta.networkHash, success: Boolean(admin && valid), createdAt: now },
  });

  if (!admin || !valid) return { ok: false, code: "invalid" };

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + authConfig.absoluteTimeoutDays * 86_400_000);
  await db.$transaction([
    // Housekeeping: drop this administrator's expired sessions.
    db.adminSession.deleteMany({ where: { adminId: admin.id, expiresAt: { lt: now } } }),
    db.adminSession.create({
      data: {
        adminId: admin.id,
        tokenHash: hashToken(token),
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    }),
    db.admin.update({ where: { id: admin.id }, data: { lastLoginAt: now } }),
  ]);
  await audit({ adminId: admin.id, action: "auth.login", ip: meta.ip });
  return { ok: true, token, expiresAt, adminId: admin.id };
}

/** Returns the administrator for a session token, or null if the session is missing, expired or idle. */
export async function validateSession(token: string | undefined, now: Date): Promise<AdminIdentity | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await db.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { admin: { select: { id: true, email: true } } },
  });
  if (!session) return null;

  const idleLimit = new Date(session.lastSeenAt.getTime() + authConfig.idleTimeoutHours * 3_600_000);
  if (now >= session.expiresAt || now >= idleLimit) {
    await db.adminSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() > authConfig.touchIntervalMinutes * 60_000) {
    await db.adminSession.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => undefined);
  }
  return { id: session.admin.id, email: session.admin.email, sessionId: session.id };
}

export async function logout(token: string | undefined, meta: RequestMeta): Promise<void> {
  if (!token) return;
  const session = await db.adminSession.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, adminId: true } });
  if (!session) return;
  await db.adminSession.delete({ where: { id: session.id } }).catch(() => undefined);
  await audit({ adminId: session.adminId, action: "auth.logout", ip: meta.ip });
}
