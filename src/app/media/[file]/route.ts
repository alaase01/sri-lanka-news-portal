import sharp from "sharp";
import { readMediaFile, writeMediaFile } from "@/server/media/storage";
import { MEDIA_FILE_PATTERN, SHARE_FILE_PATTERN, SHARE_IMAGE } from "@/lib/content/media";

/**
 * Serves processed images from storage. Names are random and a file never
 * changes once written, so responses can be cached for a year.
 *
 * `<key>-og.jpg` is the share image (1200 × 630 JPEG) for Facebook, WhatsApp
 * and X. It is made from the stored 1600 px version on the first request and
 * kept on disk, so it is created only once per image.
 */

const headers = (type: string, length: number) => ({
  "Content-Type": type,
  "Content-Length": String(length),
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
});

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

async function shareImage(file: string): Promise<Buffer | null> {
  const existing = await readMediaFile(file);
  if (existing) return existing;
  const key = SHARE_FILE_PATTERN.exec(file)![1];
  const source = await readMediaFile(`${key}-1600.webp`);
  if (!source) return null;
  const jpeg = await sharp(source)
    .resize(SHARE_IMAGE.width, SHARE_IMAGE.height, { fit: "cover", position: sharp.strategy.attention })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  // Another request may have written it at the same moment; either copy is the same.
  await writeMediaFile(file, jpeg).catch(() => undefined);
  return jpeg;
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (SHARE_FILE_PATTERN.test(file)) {
    const data = await shareImage(file).catch(() => null);
    return data ? new Response(new Uint8Array(data), { headers: headers(SHARE_IMAGE.type, data.length) }) : notFound();
  }
  if (!MEDIA_FILE_PATTERN.test(file)) return notFound();
  const data = await readMediaFile(file);
  if (!data) return notFound();
  return new Response(new Uint8Array(data), { headers: headers("image/webp", data.length) });
}
