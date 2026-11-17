"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin, requestMeta } from "@/server/auth/session";
import { audit } from "@/server/auth/audit";
import { MAX_BODY_CHARS } from "@/lib/content/body";
import { AI_LIMITS, approve, generate, type ApproveResult, type Failure, type GenerateResult } from "./assistant";
import { OPERATIONS, STYLES } from "./prompts";

/*
 * Server actions for the AI Editorial Assistant. Each checks the admin session
 * itself; Next.js server actions also reject cross-site requests (CSRF). The
 * browser sends only what the editor typed or chose; article text for the
 * "existing article" mode is loaded on the server.
 */

const id = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);
const locale = z.enum(["si", "en"]);

const generateSchema = z.object({
  mode: z.enum(["article", "paste"]),
  articleId: id.nullable(),
  sourceLocale: locale,
  headline: z.string().max(AI_LIMITS.headline * 2).default(""),
  text: z.string().max(AI_LIMITS.sourceChars * 2).default(""),
  operation: z.enum(OPERATIONS),
  style: z.enum(STYLES).nullable(),
  instructions: z.string().max(AI_LIMITS.instructions * 2).default(""),
  sourceLinks: z.array(z.string().max(AI_LIMITS.linkChars * 2)).max(AI_LIMITS.links * 2).default([]),
});

export async function generateAction(payload: string): Promise<{ ok: true; result: GenerateResult } | Failure> {
  const admin = await requireAdmin();
  if (typeof payload !== "string" || payload.length > 200_000) return { ok: false, code: "invalid", message: "The request could not be read. Reload the page." };
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return { ok: false, code: "invalid", message: "The request could not be read. Reload the page." };
  }
  const parsed = generateSchema.safeParse(data);
  if (!parsed.success) return { ok: false, code: "invalid", message: "Some of the input is too long or not valid. Check the fields and try again." };
  return generate(admin.id, parsed.data);
}

const approveSchema = z.object({
  operation: z.enum(OPERATIONS),
  mode: z.enum(["article", "paste"]),
  articleId: id.nullable(),
  locale,
  expectedUpdatedAt: z.string().max(40).nullable(),
  headline: z.string().max(1000),
  body: z.unknown(),
  slug: z.string().max(200).default(""),
  primaryCategoryId: z.string().max(40).default(""),
});

export async function approveAction(payload: string): Promise<ApproveResult> {
  const admin = await requireAdmin();
  if (typeof payload !== "string" || payload.length > MAX_BODY_CHARS * 5) return { ok: false, message: "Nothing was saved. The text is too long.", errors: {} };
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return { ok: false, message: "Nothing was saved. The request could not be read. Reload the page.", errors: {} };
  }
  const parsed = approveSchema.safeParse(data);
  if (!parsed.success) return { ok: false, message: "Nothing was saved. Some of the input is not valid.", errors: {} };
  const d = parsed.data;

  const result = await approve({ ...d, body: d.body ?? null }, new Date());
  if (!result.ok) return result;

  if (result.kind !== "suggestion") {
    updateTag("articles");
    updateTag("homepage");
  }
  await audit({
    adminId: admin.id,
    action: `ai.approve.${result.kind}`,
    entityType: "Article",
    entityId: result.articleId,
    ip: (await requestMeta()).ip,
    meta: { operation: d.operation, locale: result.locale },
  });
  return result;
}
