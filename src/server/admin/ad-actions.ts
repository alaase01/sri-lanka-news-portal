"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requestMeta } from "@/server/auth/session";
import { audit } from "@/server/auth/audit";
import { fromColomboInput } from "@/lib/utils/dates";
import type { FieldErrors } from "./articles";
import { deleteAd, moveAd, saveAd, setAdActive } from "./ads";

const id = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);
const optId = z.union([id, z.literal("")]);

export type AdFormState = { ok: boolean | null; message: string; errors: FieldErrors; updatedAt: string | null; seq: number };

const schema = z.object({
  id: optId,
  expectedUpdatedAt: z.string().max(40).default(""),
  placement: z.string().max(20),
  advertiser: z.string().max(400).default(""),
  linkUrl: z.string().max(4000).default(""),
  desktopMediaId: optId,
  mobileMediaId: optId,
  showSi: z.boolean(),
  showEn: z.boolean(),
  startsAt: z.string().max(20).default(""),
  endsAt: z.string().max(20).default(""),
  isActive: z.boolean(),
});

export async function saveAdAction(prev: AdFormState, form: FormData): Promise<AdFormState> {
  const admin = await requireAdmin();
  const fail = (message: string, errors: FieldErrors = {}): AdFormState => ({ ...prev, ok: false, message, errors });
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return fail("The form could not be read. Reload the page and try again.");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail("The form could not be read. Reload the page and try again.");
  const d = parsed.data;
  const startsAt = fromColomboInput(d.startsAt);
  const endsAt = d.endsAt ? fromColomboInput(d.endsAt) : null;
  if (d.endsAt && !endsAt) return fail("Nothing was saved. Fix the highlighted fields.", { endsAt: "Choose a valid end date and time, or leave it empty." });

  const result = await saveAd(
    {
      id: d.id || null,
      expectedUpdatedAt: d.expectedUpdatedAt || null,
      placement: d.placement,
      advertiser: d.advertiser,
      linkUrl: d.linkUrl,
      desktopMediaId: d.desktopMediaId || null,
      mobileMediaId: d.mobileMediaId || null,
      showSi: d.showSi,
      showEn: d.showEn,
      startsAt,
      endsAt,
      isActive: d.isActive,
    },
    new Date(),
  );
  if (!result.ok) return fail(result.message, result.errors);
  updateTag("ads");
  await audit({ adminId: admin.id, action: d.id ? "ad.update" : "ad.create", entityType: "Advertisement", entityId: result.id, ip: (await requestMeta()).ip });
  if (!d.id) redirect("/admin/ads?done=created");
  return { ok: true, message: "Saved. The site shows the change within a minute or two.", errors: {}, updatedAt: result.updatedAt, seq: prev.seq + 1 };
}

export async function adListAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const adId = id.safeParse(form.get("adId"));
  const op = z.enum(["on", "off", "up", "down", "delete"]).safeParse(form.get("op"));
  if (!adId.success || !op.success) redirect("/admin/ads");
  if (op.data === "delete" && form.get("confirm") !== "yes") redirect(`/admin/ads/${adId.data}?error=${encodeURIComponent("Tick the box to confirm.")}`);
  const ok =
    op.data === "on" || op.data === "off"
      ? await setAdActive(adId.data, op.data === "on")
      : op.data === "delete"
        ? await deleteAd(adId.data)
        : await moveAd(adId.data, op.data === "up" ? -1 : 1);
  if (ok) {
    updateTag("ads");
    await audit({ adminId: admin.id, action: `ad.${op.data}`, entityType: "Advertisement", entityId: adId.data, ip: (await requestMeta()).ip });
  }
  redirect(`/admin/ads?done=${op.data}`);
}
