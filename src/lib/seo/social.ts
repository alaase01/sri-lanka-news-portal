/**
 * Official social profiles. Used for the Organization `sameAs` list and the
 * footer links. Each network accepts only its own web addresses. Safe to import
 * from client components.
 */
export const SOCIAL_NETWORKS = [
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"], example: "https://www.facebook.com/yourpage" },
  { key: "x", label: "X (Twitter)", hosts: ["x.com", "twitter.com"], example: "https://x.com/yourname" },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com"], example: "https://www.youtube.com/@yourchannel" },
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"], example: "https://www.instagram.com/yourname" },
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com"], example: "https://www.tiktok.com/@yourname" },
  { key: "whatsapp", label: "WhatsApp channel", hosts: ["whatsapp.com"], example: "https://whatsapp.com/channel/…" },
  { key: "telegram", label: "Telegram", hosts: ["t.me"], example: "https://t.me/yourchannel" },
  { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"], example: "https://www.linkedin.com/company/yourname" },
] as const;

export type SocialKey = (typeof SOCIAL_NETWORKS)[number]["key"];

/** The cleaned address, or an error message. Empty input means "not set". */
export function checkSocialUrl(key: SocialKey, raw: string): { url: string | null } | { error: string } {
  const value = raw.trim();
  if (!value) return { url: null };
  const net = SOCIAL_NETWORKS.find((n) => n.key === key)!;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { error: `Enter the full address, for example ${net.example}` };
  }
  const host = u.hostname.toLowerCase();
  const allowed = net.hosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (u.protocol !== "https:" || !allowed) return { error: `Enter a ${net.label} address starting with https://, for example ${net.example}` };
  if (u.username || u.password || u.pathname.length < 2) return { error: `Enter the address of your ${net.label} profile or page, not just the website.` };
  if (value.length > 300) return { error: "That address is too long." };
  u.hash = "";
  return { url: u.toString() };
}

/** Stored links, keeping only valid ones, in the fixed network order. */
export function socialProfiles(stored: unknown): { key: SocialKey; label: string; url: string }[] {
  const map = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  return SOCIAL_NETWORKS.flatMap((n) => {
    const v = map[n.key];
    if (typeof v !== "string") return [];
    const r = checkSocialUrl(n.key, v);
    return "url" in r && r.url ? [{ key: n.key, label: n.label, url: r.url }] : [];
  });
}
