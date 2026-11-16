"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requestMeta } from "@/server/auth/session";
import { audit } from "@/server/auth/audit";
import {
  addBlock,
  addBreaking,
  addHeroStory,
  endBreaking,
  moveBlock,
  moveHeroStory,
  removeBlock,
  removeHeroStory,
  setBlockEnabled,
} from "./homepage";

const id = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);
const OPS = [
  "hero.add", "hero.up", "hero.down", "hero.remove",
  "breaking.add", "breaking.end",
  "block.add", "block.up", "block.down", "block.enable", "block.disable", "block.remove",
] as const;

/** How long a pick stays: hours, or "none" for no end. */
const DURATIONS: Record<string, number | null> = { none: null, "1h": 1, "3h": 3, "6h": 6, "12h": 12, "1d": 24, "3d": 72, "7d": 168 };

/** Every homepage change goes through here: one form field `op` says which. */
export async function curationAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const locale = form.get("locale") === "en" ? "en" : "si";
  const back = (params: Record<string, string>) => `/admin/homepage?${new URLSearchParams({ lang: locale, ...params })}`;
  const op = z.enum(OPS).safeParse(form.get("op"));
  if (!op.success) redirect(back({ error: "The form could not be read. Reload the page." }));

  const target = id.safeParse(form.get("id") ?? form.get("articleId") ?? form.get("categoryId"));
  if (!target.success) redirect(back({ error: op.data.endsWith(".add") ? "Choose an item first." : "The form could not be read. Reload the page." }));
  const now = new Date();
  const hours = DURATIONS[String(form.get("duration") ?? "none")];
  const until = hours === undefined || hours === null ? null : new Date(now.getTime() + hours * 3_600_000);

  const t = target.data;
  const result = await (async () => {
    switch (op.data) {
      case "hero.add":
        return addHeroStory(locale, t, until, now);
      case "hero.up":
      case "hero.down":
        return moveHeroStory(t, op.data === "hero.up" ? -1 : 1);
      case "hero.remove":
        return removeHeroStory(t);
      case "breaking.add":
        return addBreaking(locale, t, String(form.get("text") ?? "").slice(0, 400), until, now);
      case "breaking.end":
        return endBreaking(t);
      case "block.add":
        return addBlock(t);
      case "block.up":
      case "block.down":
        return moveBlock(t, op.data === "block.up" ? -1 : 1);
      case "block.enable":
      case "block.disable":
        return setBlockEnabled(t, op.data === "block.enable");
      case "block.remove":
        return removeBlock(t);
    }
  })();
  if (!result.ok) redirect(back({ error: result.message }));

  updateTag("homepage");
  await audit({ adminId: admin.id, action: `homepage.${op.data}`, entityType: "Homepage", entityId: t, ip: (await requestMeta()).ip, meta: { locale } });
  redirect(back({ done: op.data }));
}
