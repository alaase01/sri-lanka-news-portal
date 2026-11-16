/**
 * YouTube links. Editors paste whatever YouTube gives them (watch, share,
 * Shorts, live or embed links, or the bare 11-character ID); only the ID is
 * stored. Videos are played through youtube-nocookie.com, which sets no
 * cookies until the reader presses play.
 */

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

/** The video ID from a YouTube link or bare ID, or null when it is not a YouTube video. */
export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  if (YOUTUBE_ID.test(value)) return value;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (url.hostname.toLowerCase().endsWith("youtu.be")) id = parts[0] ?? null;
  else if (parts[0] === "watch") id = url.searchParams.get("v");
  else if (["shorts", "embed", "live", "v", "e"].includes(parts[0] ?? "")) id = parts[1] ?? null;
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Embed address used only after the reader presses play. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}

/** YouTube's own thumbnail, fetched once by the server when a video is saved. */
export function youtubeThumbnailUrls(id: string): string[] {
  return [`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`];
}

/** "3:24", "1:02:03" or "204" (seconds) → seconds. Null when malformed. */
export function parseDuration(input: string): number | null {
  const v = input.trim();
  if (!v) return 0;
  if (/^\d{1,6}$/.test(v)) return Number(v);
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(v);
  if (!m) return null;
  const [h, min, s] = [Number(m[1] ?? 0), Number(m[2]), Number(m[3])];
  if (s > 59 || (m[1] !== undefined && min > 59)) return null;
  return h * 3600 + min * 60 + s;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}
