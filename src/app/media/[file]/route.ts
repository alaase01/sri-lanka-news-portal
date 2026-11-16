import { readMediaFile } from "@/server/media/storage";
import { MEDIA_FILE_PATTERN } from "@/lib/content/media";

/**
 * Serves processed images from storage. Names are random and a file never
 * changes once written, so responses can be cached for a year.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!MEDIA_FILE_PATTERN.test(file)) return new Response("Not found", { status: 404 });
  const data = await readMediaFile(file);
  if (!data) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
