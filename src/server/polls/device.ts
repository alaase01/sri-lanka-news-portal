import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { votingConfig } from "@/config/voting";

/**
 * Device recognition for voting.
 *
 * A device is recognised by a random token that this server generates and stores
 * in an HttpOnly cookie. The cookie value is `token.issuedAt.signature`; the
 * signature proves the server issued it, so a made-up or edited value is
 * rejected. The database stores only an HMAC of the token, never the token.
 *
 * This recognises a browser profile, not a physical machine. Clearing cookies,
 * private browsing or a second browser produces a new token. See docs/polls.md.
 */

export const DEVICE_COOKIE = process.env.NODE_ENV === "production" ? "__Host-rs_vd" : "rs_vd";

export type Device = { hash: string; issuedAt: Date };

function hmac(purpose: string, value: string): Buffer {
  return createHmac("sha256", env.VOTE_SECRET).update(`${purpose}\n${value}`).digest();
}

export function issueDeviceCookie(now: Date): { value: string; device: Device } {
  const token = randomBytes(32).toString("base64url");
  const issuedAt = Math.floor(now.getTime() / 1000);
  const signature = hmac("device-cookie-v1", `${token}.${issuedAt}`).toString("base64url");
  return {
    value: `${token}.${issuedAt}.${signature}`,
    device: { hash: deviceHash(token), issuedAt: new Date(issuedAt * 1000) },
  };
}

function deviceHash(token: string): string {
  return hmac("device-id-v1", token).toString("hex");
}

export type ParsedDevice = { status: "valid"; device: Device } | { status: "missing" } | { status: "invalid" };

/** Verifies a cookie value. Anything not issued by this server is "invalid". */
export function parseDeviceCookie(value: string | undefined, now: Date): ParsedDevice {
  if (!value) return { status: "missing" };
  const parts = value.split(".");
  if (parts.length !== 3) return { status: "invalid" };
  const [token, issuedAtText, signature] = parts;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[0-9]{9,11}$/.test(issuedAtText)) return { status: "invalid" };

  const expected = hmac("device-cookie-v1", `${token}.${issuedAtText}`);
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64url");
  } catch {
    return { status: "invalid" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { status: "invalid" };

  const issuedAt = new Date(Number(issuedAtText) * 1000);
  // A token dated in the future was not issued by a correctly running server.
  if (issuedAt.getTime() > now.getTime() + 60_000) return { status: "invalid" };
  return { status: "valid", device: { hash: deviceHash(token), issuedAt } };
}

export function deviceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: votingConfig.deviceCookieDays * 86_400,
  };
}

/**
 * A keyed hash of the visitor's network address, used only to spot bursts of
 * activity. The key includes the date, so the same address hashes differently
 * each day and cannot be followed over time. The raw address is never stored.
 * IPv6 addresses are reduced to their /64 network first.
 */
export function networkHash(ip: string | null, now: Date): string | null {
  if (!ip) return null;
  let key = ip.trim().toLowerCase();
  if (key.startsWith("::ffff:")) key = key.slice(7);
  if (key.includes(":")) key = key.split(":").slice(0, 4).join(":");
  if (!/^[0-9a-f.:]{3,45}$/.test(key)) return null;
  const day = now.toISOString().slice(0, 10);
  return hmac("network-v1", `${day}\n${key}`).toString("hex").slice(0, 40);
}

/**
 * The client address as reported by the reverse proxy. The site must run behind
 * a proxy that sets this header itself; otherwise a client could forge it.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || null;
  return headers.get("x-real-ip");
}
