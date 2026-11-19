"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireAdmin, requestMeta } from "@/server/auth/session";
import { audit } from "@/server/auth/audit";
import { approveHeld, discardHeld, executeRun, markNoticesRead, setEnabled, setMaxStories, startManualRun } from "./service";

/* Newsroom controls. Each checks the admin session; none can publish. */

const back = (q: string) => redirect(`/admin/newsroom?${q}`);
const id = (v: FormDataEntryValue | null) => (typeof v === "string" && /^[a-z0-9]{1,40}$/i.test(v) ? v : "");

async function log(adminId: string, action: string, entityId: string, meta?: Record<string, string | number>) {
  await audit({ adminId, action, entityType: "Newsroom", entityId, ip: (await requestMeta()).ip, meta });
}

export async function runNowAction() {
  const admin = await requireAdmin();
  const r = await startManualRun(admin.id, new Date());
  if (!r.ok) back(`error=${encodeURIComponent(r.message)}`);
  else {
    await log(admin.id, "newsroom.run", r.runId);
    const runId = r.runId;
    after(() => executeRun(runId));
    back("done=started");
  }
}

export async function setEnabledAction(formData: FormData) {
  const admin = await requireAdmin();
  const enabled = formData.get("enabled") === "on";
  const r = await setEnabled(enabled, new Date());
  if (!r.ok) back(`error=${encodeURIComponent(r.message)}`);
  await log(admin.id, enabled ? "newsroom.enable" : "newsroom.pause", "1");
  back(`done=${enabled ? "enabled" : "paused"}`);
}

export async function setMaxStoriesAction(formData: FormData) {
  const admin = await requireAdmin();
  const n = Number(formData.get("maxStories"));
  const r = await setMaxStories(n);
  if (!r.ok) back(`error=${encodeURIComponent(r.message)}`);
  await log(admin.id, "newsroom.settings", "1", { maxStoriesPerRun: n });
  back("done=saved");
}

export async function approveHeldAction(formData: FormData) {
  const admin = await requireAdmin();
  const storyId = id(formData.get("storyId"));
  const r = await approveHeld(storyId, new Date());
  if (!r.ok) redirect(`/admin/newsroom/stories/${storyId}?error=${encodeURIComponent(r.message)}`);
  await log(admin.id, "newsroom.approve-held", storyId, { articleId: r.articleId });
  redirect(`/admin/newsroom/stories/${storyId}?done=drafted`);
}

export async function discardHeldAction(formData: FormData) {
  const admin = await requireAdmin();
  const storyId = id(formData.get("storyId"));
  await discardHeld(storyId);
  await log(admin.id, "newsroom.discard-held", storyId);
  back("done=discarded");
}

export async function markNoticesReadAction() {
  await requireAdmin();
  await markNoticesRead(new Date());
  back("done=read");
}
