"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requestMeta } from "@/server/auth/session";
import { audit } from "@/server/auth/audit";
import { fromColomboInput } from "@/lib/utils/dates";
import type { FieldErrors } from "./articles";
import { changePollState, moderateComments, reopenPoll, savePoll, type PollAction } from "./polls";

/*
 * Server actions for polls and comment moderation. Each checks the session
 * and validates its input. None of them can change or delete a vote.
 */

const id = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);
const str = (max: number) => z.string().max(max).default("");
const textBlock = z.object({ question: str(1000), description: str(4000), seoTitle: str(400), metaDescription: str(1000) });

export type PollFormState = { ok: boolean | null; message: string; errors: FieldErrors; updatedAt: string | null; seq: number };

const pollSchema = z.object({
  id: z.union([id, z.literal("")]),
  expectedUpdatedAt: str(40),
  intent: z.enum(["save", "publish"]),
  slug: str(200),
  startsAt: str(20),
  endsAt: str(20),
  resultsVisibility: z.enum(["ALWAYS", "AFTER_VOTE", "AFTER_CLOSE"]),
  featuredMediaId: z.union([id, z.literal("")]),
  si: textBlock,
  en: textBlock,
  options: z.array(z.object({ id: z.union([id, z.null()]), si: str(600), en: str(600) })).max(20),
});

export async function savePollAction(prev: PollFormState, form: FormData): Promise<PollFormState> {
  const admin = await requireAdmin();
  const fail = (message: string, errors: FieldErrors = {}): PollFormState => ({ ...prev, ok: false, message, errors });
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return fail("The form could not be read. Reload the page and try again.");
  }
  const intent = form.get("intent");
  const parsed = pollSchema.safeParse({ ...(payload as object), intent });
  if (!parsed.success) return fail("The form could not be read. Reload the page and try again.");
  const d = parsed.data;

  const startsAt = fromColomboInput(d.startsAt);
  const endsAt = fromColomboInput(d.endsAt);
  const result = await savePoll(
    {
      id: d.id || null,
      expectedUpdatedAt: d.expectedUpdatedAt || null,
      intent: d.intent,
      slug: d.slug.trim(),
      startsAt,
      endsAt,
      resultsVisibility: d.resultsVisibility,
      featuredMediaId: d.featuredMediaId || null,
      si: d.si,
      en: d.en,
      options: d.options,
    },
    new Date(),
  );
  if (!result.ok) return fail(result.message, result.errors);

  updateTag("polls");
  await audit({
    adminId: admin.id,
    action: d.id ? (d.intent === "publish" ? "poll.publish" : "poll.update") : "poll.create",
    entityType: "Poll",
    entityId: result.id,
    ip: (await requestMeta()).ip,
    meta: { status: result.status },
  });
  if (!d.id) redirect(`/admin/polls/${result.id}?created=1`);
  return {
    ok: true,
    message: d.intent === "publish" ? "Published. Voting opens and closes at the times you set." : result.status === "DRAFT" ? "Saved as a draft." : "Saved. The changes are live.",
    errors: {},
    updatedAt: result.updatedAt,
    seq: prev.seq + 1,
  };
}

const ACTIONS = ["close", "archive", "unarchive", "hide", "show", "unpublish", "bin", "restore"] as const;

export async function pollStateAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const pollId = id.safeParse(form.get("pollId"));
  const action = z.enum(ACTIONS).safeParse(form.get("action"));
  if (!pollId.success || !action.success) redirect("/admin/polls");
  if ((action.data === "bin" || action.data === "close") && form.get("confirm") !== "yes") {
    redirect(`/admin/polls/${pollId.data}?error=${encodeURIComponent("Tick the box to confirm.")}`);
  }
  const result = await changePollState(pollId.data, action.data as PollAction, new Date());
  if (!result.ok) redirect(`/admin/polls/${pollId.data}?error=${encodeURIComponent(result.message)}`);
  updateTag("polls");
  await audit({ adminId: admin.id, action: `poll.${action.data}`, entityType: "Poll", entityId: pollId.data, ip: (await requestMeta()).ip });
  if (action.data === "bin") redirect("/admin/polls?binned=1");
  redirect(`/admin/polls/${pollId.data}?done=${action.data}&t=${Date.now().toString(36)}`);
}

export async function reopenPollAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const pollId = id.safeParse(form.get("pollId"));
  if (!pollId.success) redirect("/admin/polls");
  const endsAt = fromColomboInput(String(form.get("endsAt") ?? ""));
  if (!endsAt) redirect(`/admin/polls/${pollId.data}?error=${encodeURIComponent("Choose the new closing time.")}`);
  const result = await reopenPoll(pollId.data, endsAt, new Date());
  if (!result.ok) redirect(`/admin/polls/${pollId.data}?error=${encodeURIComponent(result.message)}`);
  updateTag("polls");
  await audit({ adminId: admin.id, action: "poll.reopen", entityType: "Poll", entityId: pollId.data, ip: (await requestMeta()).ip });
  redirect(`/admin/polls/${pollId.data}?done=reopen&t=${Date.now().toString(36)}`);
}

/** Replaces the given query parameters on a site-relative URL. */
function withParams(path: string, params: Record<string, string>): string {
  const url = new URL(path, "http://admin.invalid");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return `${url.pathname}${url.search}`;
}

/** Bulk or single moderation from the comments queue. `returnTo` must be an admin comments URL. */
export async function moderateCommentsAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const ids = z.array(id).min(1).max(100).safeParse(form.getAll("commentId"));
  const status = z.enum(["APPROVED", "HIDDEN", "PENDING"]).safeParse(form.get("decision"));
  const back = String(form.get("returnTo") ?? "");
  const returnTo = /^\/admin\/comments(\?[A-Za-z0-9=&_%.-]*)?$/.test(back) ? back : "/admin/comments";
  if (!ids.success || !status.success) redirect(withParams(returnTo, { moderated: "none" }));
  const count = await moderateComments(ids.data, status.data, new Date());
  await audit({
    adminId: admin.id,
    action: `comment.${status.data === "APPROVED" ? "approve" : status.data === "HIDDEN" ? "hide" : "requeue"}`,
    entityType: "PollComment",
    entityId: ids.data.length === 1 ? ids.data[0] : undefined,
    ip: (await requestMeta()).ip,
    meta: { count, ids: ids.data.slice(0, 100) },
  });
  redirect(withParams(returnTo, { moderated: status.data, n: String(count) }));
}
