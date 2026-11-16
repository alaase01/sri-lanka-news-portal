import "server-only";
import { cookies } from "next/headers";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { DEVICE_COOKIE, deviceCookieOptions, issueDeviceCookie, parseDeviceCookie, type Device } from "./device";

const ID = /^[a-z0-9]{20,40}$/;

export function isPollId(value: string): boolean {
  return ID.test(value);
}

export function localeFrom(value: string | null): Locale {
  return value && isLocale(value) ? value : "si";
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * A browser sends Origin on every cross-site request and on same-site POSTs.
 * Requiring it to match this site's own host stops other sites from submitting
 * votes through a visitor's browser.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Reads the device cookie without changing it. */
export async function readDevice(now: Date): Promise<{ device: Device | null; invalid: boolean }> {
  const parsed = parseDeviceCookie((await cookies()).get(DEVICE_COOKIE)?.value, now);
  return parsed.status === "valid"
    ? { device: parsed.device, invalid: false }
    : { device: null, invalid: parsed.status === "invalid" };
}

/** Reads the device cookie, issuing a new one if absent or invalid, and renews its lifetime. */
export async function ensureDevice(now: Date): Promise<{ device: Device; wasInvalid: boolean }> {
  const store = await cookies();
  const raw = store.get(DEVICE_COOKIE)?.value;
  const parsed = parseDeviceCookie(raw, now);
  if (parsed.status === "valid" && raw) {
    store.set(DEVICE_COOKIE, raw, deviceCookieOptions());
    return { device: parsed.device, wasInvalid: false };
  }
  const issued = issueDeviceCookie(now);
  store.set(DEVICE_COOKIE, issued.value, deviceCookieOptions());
  return { device: issued.device, wasInvalid: parsed.status === "invalid" };
}
