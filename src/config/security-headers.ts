/**
 * HTTP security headers. Public pages are cached and identical for every
 * visitor, so they cannot carry a per-request nonce; their policy allows inline
 * scripts (which Next.js needs) but nothing from other sites. Admin pages render
 * per request and get a strict nonce-based policy from src/proxy.ts.
 *
 * Third parties are added here deliberately: so far only the YouTube player
 * (youtube-nocookie.com, framed after the reader presses play). An ad network
 * will need its own hosts.
 */

const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";

function policy(scriptSrc: string): string {
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    // The click-to-play video player; nothing else may be framed.
    "frame-src https://www.youtube-nocookie.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export const publicCsp = policy("'self' 'unsafe-inline'");

export function adminCsp(nonce: string): string {
  return policy(`'self' 'nonce-${nonce}' 'strict-dynamic'`);
}

/** Headers for every response. */
export const baseSecurityHeaders: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];
