import "server-only";
import { db } from "@/server/db/client";
import { SHARE_MIN_SOURCE_WIDTH } from "@/lib/content/media";
import { checkSocialUrl, SOCIAL_NETWORKS, socialProfiles, type SocialKey } from "@/lib/seo/social";

/** Site settings: official social profiles and the default share image. Callers must have checked the session. */

export type SettingsView = { social: Partial<Record<SocialKey, string>>; defaultShareMediaId: string | null };

export async function getSettings(): Promise<SettingsView> {
  const s = await db.siteSettings.findUnique({ where: { id: 1 }, select: { socialLinks: true, defaultShareMediaId: true } });
  return {
    social: Object.fromEntries(socialProfiles(s?.socialLinks).map((p) => [p.key, p.url])),
    defaultShareMediaId: s?.defaultShareMediaId ?? null,
  };
}

export type SettingsInput = { social: Record<string, string>; defaultShareMediaId: string };
export type SettingsResult = { ok: true } | { ok: false; message: string; errors: Record<string, string> };

export async function saveSettings(input: SettingsInput): Promise<SettingsResult> {
  const errors: Record<string, string> = {};
  const links: Record<string, string> = {};
  for (const n of SOCIAL_NETWORKS) {
    const r = checkSocialUrl(n.key, input.social[n.key] ?? "");
    if ("error" in r) errors[n.key] = r.error;
    else if (r.url) links[n.key] = r.url;
  }
  let mediaId: string | null = null;
  if (input.defaultShareMediaId) {
    const m = await db.media.findUnique({ where: { id: input.defaultShareMediaId }, select: { id: true, width: true } });
    if (!m) errors.defaultShareMediaId = "That image no longer exists. Choose another.";
    else if (m.width < SHARE_MIN_SOURCE_WIDTH) errors.defaultShareMediaId = `Choose an image at least ${SHARE_MIN_SOURCE_WIDTH} pixels wide (1200 or more is best).`;
    else mediaId = m.id;
  }
  if (Object.keys(errors).length) return { ok: false, message: "Nothing was saved. Fix the highlighted fields.", errors };

  await db.siteSettings.upsert({
    where: { id: 1 },
    create: { id: 1, socialLinks: links, defaultShareMediaId: mediaId },
    update: { socialLinks: links, defaultShareMediaId: mediaId },
  });
  return { ok: true };
}
