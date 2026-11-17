import { recordAdEvents } from "@/server/services/ads";

/**
 * Counts banner views sent by the page (navigator.sendBeacon) when a banner
 * has been at least half visible for a second. Accepts only same-site requests
 * with a small list of ids; stores counts only.
 */
export async function POST(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });
  const text = await request.text();
  if (text.length > 1000) return new Response(null, { status: 413 });
  let ids: unknown;
  try {
    ids = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string" || !/^[a-z0-9]{1,40}$/i.test(x))) return new Response(null, { status: 400 });
  await recordAdEvents(ids as string[], "views", new Date());
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
