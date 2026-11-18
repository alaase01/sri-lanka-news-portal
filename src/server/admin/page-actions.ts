"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin, requestMeta } from "@/server/auth/session";
import { audit } from "@/server/auth/audit";
import { MAX_BODY_CHARS } from "@/lib/content/body";
import { savePage, type PageSaveResult } from "./pages";

const schema = z.object({
  key: z.string().min(1).max(40).regex(/^[a-z]+$/),
  locale: z.enum(["si", "en"]),
  expectedUpdatedAt: z.string().max(40).nullable(),
  intent: z.enum(["save", "publish", "unpublish"]),
  title: z.string().max(1000),
  body: z.unknown(),
  seoTitle: z.string().max(1000),
  metaDescription: z.string().max(2000),
});

/** Saves, publishes or unpublishes one language version of a static page. */
export async function savePageAction(payload: string): Promise<PageSaveResult> {
  const admin = await requireAdmin();
  if (typeof payload !== "string" || payload.length > MAX_BODY_CHARS * 3) return { ok: false, message: "Nothing was saved. The page is too long.", errors: {} };
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return { ok: false, message: "Nothing was saved. The request could not be read. Reload the page.", errors: {} };
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) return { ok: false, message: "Nothing was saved. Some of the input is not valid.", errors: {} };

  const result = await savePage(parsed.data, admin.id, new Date());
  if (!result.ok) return result;

  // Only published content is public; refresh the page and the footer links when that changes.
  if (parsed.data.intent !== "save") updateTag("pages");
  await audit({
    adminId: admin.id,
    action: `page.${parsed.data.intent}`,
    entityType: "StaticPage",
    entityId: parsed.data.key,
    ip: (await requestMeta()).ip,
    meta: { locale: parsed.data.locale },
  });
  return result;
}
