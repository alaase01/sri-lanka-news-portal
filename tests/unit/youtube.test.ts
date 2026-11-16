import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration, parseYouTubeId, youtubeEmbedUrl } from "@/lib/content/youtube";

const ID = "dQw4w9WgXcQ";

describe("YouTube links", () => {
  it("reads every common link format", () => {
    for (const link of [
      ID,
      `https://www.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`,
      `http://youtube.com/watch?feature=share&v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=abc&t=10`,
      `youtu.be/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}?feature=share`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `  https://www.youtube.com/watch?v=${ID}  `,
    ]) {
      expect(parseYouTubeId(link), link).toBe(ID);
    }
  });

  it("rejects other sites, bad IDs and tricks", () => {
    for (const bad of [
      "",
      "not a link",
      "dQw4w9WgXc",
      `https://evil.example/watch?v=${ID}`,
      `https://youtube.com.evil.example/watch?v=${ID}`,
      `https://www.youtube.com/watch?v=${ID}"><script>`,
      `javascript:alert('${ID}')`,
      `https://www.youtube.com/channel/UC1234567890`,
      `https://www.youtube.com/playlist?list=PL${ID}`,
      `ftp://youtu.be/${ID}`,
    ]) {
      expect(parseYouTubeId(bad), bad).toBeNull();
    }
  });

  it("embeds through the no-cookie domain", () => {
    expect(youtubeEmbedUrl(ID)).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
  });
});

describe("durations", () => {
  it("parses minutes:seconds, hours and plain seconds", () => {
    expect(parseDuration("3:24")).toBe(204);
    expect(parseDuration("03:24")).toBe(204);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("125:00")).toBe(7500);
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("")).toBe(0);
    for (const bad of ["3:60", "1:60:00", "abc", "3.24", "-5", "1:2"]) expect(parseDuration(bad), bad).toBeNull();
  });
  it("formats for display", () => {
    expect(formatDuration(204)).toBe("03:24");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(0)).toBe("00:00");
  });
});
