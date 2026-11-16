"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requestMeta } from "@/server/auth/session";
import { audit } from "@/server/auth/audit";
import { deleteMedia, getMediaItems, updateMediaText, uploadMedia, UPLOAD_ERROR_TEXT, type MediaText } from "./core";
import { UPLOAD_LIMITS } from "./process";
import type { PickerImage } from "@/components/admin/MediaPicker";

const id = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);

function textFrom(form: FormData): MediaText {
  const s = (k: string) => (typeof form.get(k) === "string" ? String(form.get(k)).slice(0, 400) : "");
  return { altSi: s("altSi"), altEn: s("altEn"), captionSi: s("captionSi"), captionEn: s("captionEn"), credit: s("credit") };
}

export type UploadResult = { ok: true; image: PickerImage; duplicate: boolean } | { ok: false; error: string };

/** Called directly from the image picker and the media page. */
export async function uploadMediaAction(form: FormData): Promise<UploadResult> {
  const admin = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image file." };
  if (file.size > UPLOAD_LIMITS.maxBytes) return { ok: false, error: UPLOAD_ERROR_TEXT.too_large };

  const result = await uploadMedia(Buffer.from(await file.arrayBuffer()), textFrom(form));
  if (!result.ok) return { ok: false, error: UPLOAD_ERROR_TEXT[result.error] };

  if (!result.duplicate) {
    await audit({ adminId: admin.id, action: "media.upload", entityType: "Media", entityId: result.id, ip: (await requestMeta()).ip });
  }
  const [item] = await getMediaItems([result.id]);
  return {
    ok: true,
    duplicate: result.duplicate,
    image: { id: item.id, storageKey: item.storageKey, width: item.width, height: item.height, alt: item.altEn || item.altSi },
  };
}

export type MediaTextState = { ok: boolean | null; message: string };

export async function updateMediaTextAction(_prev: MediaTextState, form: FormData): Promise<MediaTextState> {
  const admin = await requireAdmin();
  const mediaId = id.safeParse(form.get("mediaId"));
  if (!mediaId.success) return { ok: false, message: "The form could not be read. Reload the page." };
  const result = await updateMediaText(mediaId.data, textFrom(form));
  if (!result.ok) return { ok: false, message: result.error };
  updateTag("articles");
  updateTag("homepage");
  await audit({ adminId: admin.id, action: "media.update", entityType: "Media", entityId: mediaId.data, ip: (await requestMeta()).ip });
  return { ok: true, message: "Saved." };
}

export async function deleteMediaAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const mediaId = id.safeParse(form.get("mediaId"));
  if (!mediaId.success || form.get("confirm") !== "yes") redirect("/admin/media");
  const result = await deleteMedia(mediaId.data);
  if (result.ok) {
    await audit({ adminId: admin.id, action: "media.delete", entityType: "Media", entityId: mediaId.data, ip: (await requestMeta()).ip });
    redirect("/admin/media?deleted=1");
  }
  redirect(`/admin/media?error=in-use`);
}
