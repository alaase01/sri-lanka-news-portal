import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "@/config/env";
import { MEDIA_FILE_PATTERN } from "@/lib/content/media";

/**
 * Local-disk storage for processed images. File names are generated
 * (`<32 hex>-<width>.webp`) and checked against a strict pattern before any
 * file-system call, so a request can never reach another path.
 *
 * Moving to object storage later means replacing these three functions.
 */

// Runtime data, not source code: excluded from build-time file tracing.
const root = () => resolve(/*turbopackIgnore: true*/ process.cwd(), env.MEDIA_DIR);

function pathFor(name: string): string {
  if (!MEDIA_FILE_PATTERN.test(name)) throw new Error("invalid media file name");
  return join(/*turbopackIgnore: true*/ root(), name.slice(0, 2), name);
}

export async function writeMediaFile(name: string, data: Buffer): Promise<void> {
  const path = pathFor(name);
  await mkdir(join(/*turbopackIgnore: true*/ root(), name.slice(0, 2)), { recursive: true });
  // "wx": never overwrite an existing file.
  await writeFile(path, data, { flag: "wx" });
}

export async function readMediaFile(name: string): Promise<Buffer | null> {
  if (!MEDIA_FILE_PATTERN.test(name)) return null;
  try {
    return await readFile(pathFor(name));
  } catch {
    return null;
  }
}

export async function deleteMediaFile(name: string): Promise<void> {
  await rm(pathFor(name), { force: true });
}
