import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authConfig } from "@/config/auth";
import { db } from "@/server/db/client";
import { hashToken, login, logout, validateSession, type RequestMeta } from "@/server/auth/core";
import { hashPassword } from "@/server/auth/password";

/**
 * Administrator authentication against a real database. Each test uses its own
 * administrator (unique email) and its own network hash, and everything is
 * removed afterwards. The site's real administrator is never touched.
 */

const RUN = `t${Date.now().toString(36)}`;
const PASSWORD = "correct horse battery staple";
const BASE = new Date("2026-06-01T08:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
let n = 0;

async function makeAdmin() {
  const email = `${RUN}-${n++}@test.local`;
  const admin = await db.admin.create({ data: { email, passwordHash: await hashPassword(PASSWORD) } });
  return { ...admin, email };
}

function meta(tag = `net-${n}`): RequestMeta {
  return { ip: "198.51.100.7", userAgent: "vitest", networkHash: `${RUN}-${tag}` };
}

const at = (offsetMs: number) => new Date(BASE.getTime() + offsetMs);

beforeAll(async () => {
  await db.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  const admins = await db.admin.findMany({ where: { email: { startsWith: RUN } }, select: { id: true } });
  const ids = admins.map((a) => a.id);
  await db.auditLog.deleteMany({ where: { adminId: { in: ids } } });
  await db.adminSession.deleteMany({ where: { adminId: { in: ids } } });
  await db.admin.deleteMany({ where: { id: { in: ids } } });
  await db.loginAttempt.deleteMany({ where: { networkHash: { startsWith: RUN } } });
  await db.$disconnect();
});

describe("login", () => {
  it("signs in with the right password and stores only a hash of the token", async () => {
    const admin = await makeAdmin();
    const result = await login(admin.email.toUpperCase(), PASSWORD, meta(), at(0));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const session = await db.adminSession.findFirstOrThrow({ where: { adminId: admin.id } });
    expect(session.tokenHash).toBe(hashToken(result.token));
    expect(session.tokenHash).not.toContain(result.token);
    expect(session.expiresAt.getTime()).toBe(at(authConfig.absoluteTimeoutDays * 24 * HOUR).getTime());

    expect((await db.admin.findUniqueOrThrow({ where: { id: admin.id } })).lastLoginAt?.getTime()).toBe(at(0).getTime());
    expect(await db.auditLog.count({ where: { adminId: admin.id, action: "auth.login" } })).toBe(1);
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    const admin = await makeAdmin();
    expect(await login(admin.email, "wrong password entirely", meta(), at(0))).toEqual({ ok: false, code: "invalid" });
    expect(await login(`nobody-${RUN}@test.local`, PASSWORD, meta(), at(0))).toEqual({ ok: false, code: "invalid" });
    expect(await login("not an email", PASSWORD, meta(), at(0))).toEqual({ ok: false, code: "invalid" });
  });

  it("issues a new token on every login", async () => {
    const admin = await makeAdmin();
    const a = await login(admin.email, PASSWORD, meta(), at(0));
    const b = await login(admin.email, PASSWORD, meta(), at(MIN));
    expect(a.ok && b.ok && a.token !== b.token).toBe(true);
  });

  it("records attempts without the email address", async () => {
    const admin = await makeAdmin();
    const net = meta("record");
    await login(admin.email, "wrong password entirely", net, at(0));
    const rows = await db.loginAttempt.findMany({ where: { networkHash: net.networkHash } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(admin.email);
    expect(JSON.stringify(rows)).not.toContain(admin.email.split("@")[0]);
  });
});

describe("rate limiting", () => {
  it("pauses an account after 5 failures, even for the right password", async () => {
    const admin = await makeAdmin();
    for (let i = 0; i < authConfig.maxFailuresPerAccount; i++) {
      expect((await login(admin.email, `wrong ${i} password`, meta(`acct-${i}`), at(i * MIN))).ok).toBe(false);
    }
    expect(await login(admin.email, PASSWORD, meta("acct-x"), at(6 * MIN))).toEqual({ ok: false, code: "rate_limited" });
    expect(await db.auditLog.count({ where: { action: "auth.login_blocked", createdAt: { gte: new Date(Date.now() - HOUR) } } })).toBeGreaterThan(0);
  });

  it("lifts the pause once the window has passed", async () => {
    const admin = await makeAdmin();
    for (let i = 0; i < 5; i++) await login(admin.email, `wrong ${i} password`, meta(`lift-${i}`), at(i * MIN));
    const later = at((authConfig.failureWindowMinutes + 5) * MIN);
    expect((await login(admin.email, PASSWORD, meta("lift-x"), later)).ok).toBe(true);
  });

  it("does not count failures from before a successful login", async () => {
    const admin = await makeAdmin();
    for (let i = 0; i < 4; i++) await login(admin.email, `wrong ${i} password`, meta(`reset-${i}`), at(i * MIN));
    expect((await login(admin.email, PASSWORD, meta("reset-ok"), at(5 * MIN))).ok).toBe(true);
    for (let i = 0; i < 4; i++) await login(admin.email, `wrong again ${i}`, meta(`reset2-${i}`), at((6 + i) * MIN));
    expect((await login(admin.email, PASSWORD, meta("reset-ok2"), at(11 * MIN))).ok).toBe(true);
  });

  it("pauses a network that fails across many accounts", async () => {
    const net = meta("spray");
    for (let i = 0; i < authConfig.maxFailuresPerNetwork; i++) {
      await login(`spray-${i}-${RUN}@test.local`, "wrong password here", net, at(i * 1000));
    }
    const admin = await makeAdmin();
    expect(await login(admin.email, PASSWORD, net, at(30_000))).toEqual({ ok: false, code: "rate_limited" });
    // The same account from another network is unaffected.
    expect((await login(admin.email, PASSWORD, meta("elsewhere"), at(31_000))).ok).toBe(true);
  });
});

describe("sessions", () => {
  async function signedIn() {
    const admin = await makeAdmin();
    const result = await login(admin.email, PASSWORD, meta(), at(0));
    if (!result.ok) throw new Error("login failed");
    return { admin, token: result.token };
  }

  it("accepts a valid token", async () => {
    const { admin, token } = await signedIn();
    expect(await validateSession(token, at(MIN))).toMatchObject({ id: admin.id, email: admin.email });
  });

  it("rejects missing, malformed and unknown tokens", async () => {
    expect(await validateSession(undefined, at(0))).toBeNull();
    expect(await validateSession("short", at(0))).toBeNull();
    expect(await validateSession("x".repeat(43), at(0))).toBeNull();
    expect(await validateSession("<script>".padEnd(43, "a"), at(0))).toBeNull();
  });

  it("rejects the stored hash used as a token", async () => {
    const { admin } = await signedIn();
    const session = await db.adminSession.findFirstOrThrow({ where: { adminId: admin.id } });
    expect(await validateSession(session.tokenHash, at(MIN))).toBeNull();
  });

  it("ends after 12 hours without activity and removes the session", async () => {
    const { admin, token } = await signedIn();
    expect(await validateSession(token, at(authConfig.idleTimeoutHours * HOUR + MIN))).toBeNull();
    expect(await db.adminSession.count({ where: { adminId: admin.id } })).toBe(0);
  });

  it("stays alive while in use, but ends after 7 days regardless", async () => {
    const { token } = await signedIn();
    // Activity every 10 hours keeps it inside the idle limit…
    for (let h = 10; h < authConfig.absoluteTimeoutDays * 24; h += 10) {
      expect(await validateSession(token, at(h * HOUR))).not.toBeNull();
    }
    // …but not past the absolute limit.
    expect(await validateSession(token, at(authConfig.absoluteTimeoutDays * 24 * HOUR + MIN))).toBeNull();
  });

  it("updates last-seen only every few minutes", async () => {
    const { admin, token } = await signedIn();
    await validateSession(token, at(MIN));
    expect((await db.adminSession.findFirstOrThrow({ where: { adminId: admin.id } })).lastSeenAt.getTime()).toBe(at(0).getTime());
    await validateSession(token, at(10 * MIN));
    expect((await db.adminSession.findFirstOrThrow({ where: { adminId: admin.id } })).lastSeenAt.getTime()).toBe(at(10 * MIN).getTime());
  });

  it("ends on logout, and the token cannot be reused", async () => {
    const { admin, token } = await signedIn();
    await logout(token, meta());
    expect(await validateSession(token, at(MIN))).toBeNull();
    expect(await db.auditLog.count({ where: { adminId: admin.id, action: "auth.logout" } })).toBe(1);
  });

  it("keeps other sessions when one is logged out", async () => {
    const admin = await makeAdmin();
    const a = await login(admin.email, PASSWORD, meta(), at(0));
    const b = await login(admin.email, PASSWORD, meta(), at(MIN));
    if (!a.ok || !b.ok) throw new Error("login failed");
    await logout(a.token, meta());
    expect(await validateSession(a.token, at(2 * MIN))).toBeNull();
    expect(await validateSession(b.token, at(2 * MIN))).not.toBeNull();
  });
});
