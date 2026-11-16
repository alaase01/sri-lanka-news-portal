"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requestMeta } from "@/server/auth/session";
import { audit } from "@/server/auth/audit";
import { fromColomboInput } from "@/lib/utils/dates";
import { parseDuration } from "@/lib/content/youtube";
import type { FieldErrors } from "./articles";
import { changeVideoState, getVideoForEdit, importYouTubeThumbnail, saveVideo, type VideoAction } from "./videos";

const id = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);
const optId = z.union([id, z.literal("")]);
const str = (max: number) => z.string().max(max).default("");
const text = z.object({ title: str(800), description: str(12000), slug: str(200), seoTitle: str(400), metaDescription: str(1200) });

function invalidate() {
  updateTag("videos");
  updateTag("homepage");
  updateTag("categories");
}

export type VideoFormState = { ok: boolean | null; message: string; errors: FieldErrors; updatedAt: string | null; status: string | null; seq: number };

const schema = z.object({
  id: optId,
  expectedUpdatedAt: str(40),
  intent: z.enum(["save", "publish", "schedule", "unpublish"]),
  youtube: str(500),
  duration: str(20),
  scheduledAt: str(20),
  thumbnailMediaId: optId,
  articleId: optId,
  categoryId: optId,
  tagIds: z.array(id).max(30),
  isFeatured: z.boolean(),
  si: text,
  en: text,
});

export async function saveVideoAction(prev: VideoFormState, form: FormData): Promise<VideoFormState> {
  const admin = await requireAdmin();
  const fail = (message: string, errors: FieldErrors = {}): VideoFormState => ({ ...prev, ok: false, message, errors });
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return fail("The form could not be read. Reload the page and try again.");
  }
  const parsed = schema.safeParse({ ...(payload as object), intent: form.get("intent") });
  if (!parsed.success) return fail("The form could not be read. Reload the page and try again.");
  const d = parsed.data;

  let scheduledAt: Date | null = null;
  if (d.intent === "schedule") {
    scheduledAt = fromColomboInput(d.scheduledAt);
    if (!scheduledAt) return fail("Nothing was saved. Fix the highlighted fields.", { scheduledAt: "Choose the date and time to publish." });
  }

  const result = await saveVideo(
    {
      id: d.id || null,
      expectedUpdatedAt: d.expectedUpdatedAt || null,
      intent: d.intent,
      youtube: d.youtube,
      duration: parseDuration(d.duration),
      scheduledAt,
      thumbnailMediaId: d.thumbnailMediaId || null,
      articleId: d.articleId || null,
      categoryId: d.categoryId || null,
      tagIds: d.tagIds,
      isFeatured: d.isFeatured,
      si: d.si,
      en: d.en,
    },
    new Date(),
  );
  if (!result.ok) return fail(result.message, result.errors);

  // No image chosen: take YouTube's thumbnail once, so readers never load it from YouTube.
  let thumbNote = "";
  if (!result.hasThumbnail) {
    const imported = await importYouTubeThumbnail(result.id);
    thumbNote = imported ? " YouTube's thumbnail was added as the image." : " YouTube's thumbnail could not be fetched; choose or upload an image.";
  }

  invalidate();
  await audit({
    adminId: admin.id,
    action: d.id ? `video.${d.intent}` : "video.create",
    entityType: "Video",
    entityId: result.id,
    ip: (await requestMeta()).ip,
    meta: { status: result.status },
  });
  if (!d.id) redirect(`/admin/videos/${result.id}?created=1${thumbNote.includes("could not") ? "&thumb=failed" : ""}`);

  const messages: Record<string, string> = {
    save: result.status === "PUBLISHED" ? "Saved. The changes are live." : "Saved.",
    publish: "Published. It is now on the site.",
    schedule: "Scheduled. It will appear on the site at the chosen time.",
    unpublish: "Taken off the site.",
  };
  // Re-read: attaching the thumbnail changes the record after the save.
  const fresh = await getVideoForEdit(result.id);
  return { ok: true, message: messages[d.intent] + thumbNote, errors: {}, updatedAt: fresh?.updatedAt.toISOString() ?? result.updatedAt, status: result.status, seq: prev.seq + 1 };
}

export async function videoStateAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const videoId = id.safeParse(form.get("videoId"));
  const action = z.enum(["bin", "restore", "feature", "unfeature"]).safeParse(form.get("action"));
  if (!videoId.success || !action.success) redirect("/admin/videos");
  if (action.data === "bin" && form.get("confirm") !== "yes") redirect(`/admin/videos/${videoId.data}`);
  if (await changeVideoState(videoId.data, action.data as VideoAction, new Date())) {
    invalidate();
    await audit({ adminId: admin.id, action: `video.${action.data}`, entityType: "Video", entityId: videoId.data, ip: (await requestMeta()).ip });
  }
  if (action.data === "bin") redirect("/admin/videos?binned=1");
  redirect(action.data === "restore" ? `/admin/videos/${videoId.data}?t=${Date.now().toString(36)}` : "/admin/videos");
}
