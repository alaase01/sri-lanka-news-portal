import { adTarget, recordAdEvents } from "@/server/services/ads";

/**
 * Banner clicks pass through here to be counted, then go to the advertiser.
 * Only the address saved for that banner is used, so this cannot be abused to
 * send people to other sites.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) return new Response("Not found", { status: 404 });
  const target = await adTarget(id);
  if (!target || !/^https?:\/\//i.test(target)) return new Response("Not found", { status: 404 });
  await recordAdEvents([id], "clicks", new Date()).catch(() => undefined);
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "origin", "X-Robots-Tag": "noindex" },
  });
}
