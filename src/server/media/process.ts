import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { MEDIA_WIDTHS } from "@/lib/content/media";

/**
 * Validates and re-encodes an uploaded image.
 *
 * The file type is decided by decoding the bytes, never by the file name or
 * the browser's content type. Only JPEG, PNG, WebP and AVIF are accepted (no
 * SVG, which can carry scripts). Every image is decoded and written out again
 * as WebP: this removes EXIF data (including GPS location), anything hidden
 * after the image data, and the original file's quirks.
 */

export const UPLOAD_LIMITS = { maxBytes: 8 * 1024 * 1024, minSide: 200, maxSide: 12_000, maxPixels: 60_000_000 } as const;
const ACCEPTED = new Set(["jpeg", "png", "webp", "avif", "heif"]);

export type ProcessedImage = {
  checksum: string;
  width: number;
  height: number;
  variants: { width: (typeof MEDIA_WIDTHS)[number]; data: Buffer }[];
};

export type ProcessError = "too_large" | "unsupported" | "too_small" | "too_big_dimensions" | "corrupt";

export async function processImage(input: Buffer): Promise<{ ok: true; image: ProcessedImage } | { ok: false; error: ProcessError }> {
  if (input.length > UPLOAD_LIMITS.maxBytes) return { ok: false, error: "too_large" };

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: UPLOAD_LIMITS.maxPixels, animated: false }).metadata();
  } catch {
    return { ok: false, error: "unsupported" };
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) return { ok: false, error: "unsupported" };
  if (meta.format === "heif" && meta.compression !== "av1") return { ok: false, error: "unsupported" };
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  if (!width || !height) return { ok: false, error: "corrupt" };
  if (width < UPLOAD_LIMITS.minSide || height < UPLOAD_LIMITS.minSide) return { ok: false, error: "too_small" };
  if (width > UPLOAD_LIMITS.maxSide || height > UPLOAD_LIMITS.maxSide) return { ok: false, error: "too_big_dimensions" };

  try {
    const variants = await Promise.all(
      MEDIA_WIDTHS.map(async (w) => ({
        width: w,
        data: await sharp(input, { limitInputPixels: UPLOAD_LIMITS.maxPixels, animated: false })
          .rotate()
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer(),
      })),
    );
    const largest = await sharp(variants[variants.length - 1].data).metadata();
    return {
      ok: true,
      image: {
        checksum: createHash("sha256").update(input).digest("hex"),
        width: largest.width ?? width,
        height: largest.height ?? height,
        variants,
      },
    };
  } catch {
    return { ok: false, error: "corrupt" };
  }
}
