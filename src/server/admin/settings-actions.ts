"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin, requestMeta } from "@/server/auth/session";
import { audit } from "@/server/auth/audit";
import { saveSettings, type SettingsResult } from "./settings";

const schema = z.object({
  social: z.record(z.string().max(40), z.string().max(1000)),
  defaultShareMediaId: z.string().max(40),
  aiMonthlyBudgetUsd: z.string().max(20),
});

export async function saveSettingsAction(payload: string): Promise<SettingsResult> {
  const admin = await requireAdmin();
  let data: unknown;
  try {
    data = JSON.parse(typeof payload === "string" && payload.length < 20_000 ? payload : "null");
  } catch {
    data = null;
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) return { ok: false, message: "Nothing was saved. The request could not be read. Reload the page.", errors: {} };
  const r = await saveSettings(parsed.data);
  if (!r.ok) return r;
  updateTag("settings");
  await audit({ adminId: admin.id, action: "settings.save", entityType: "SiteSettings", entityId: "1", ip: (await requestMeta()).ip, meta: { networks: Object.keys(parsed.data.social).filter((k) => parsed.data.social[k]), aiMonthlyBudgetUsd: parsed.data.aiMonthlyBudgetUsd } });
  return { ok: true };
}
