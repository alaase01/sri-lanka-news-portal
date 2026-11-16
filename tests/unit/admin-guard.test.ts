import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against a future admin page or server action that forgets to check
 * the session. Layouts are not a security boundary in Next.js, so every admin
 * page and every exported server action must call requireAdmin() itself.
 */

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, pattern) : pattern.test(name) ? [path] : [];
  });
}

const ADMIN_APP = "src/app/(admin)";
// Signing in and out must work without a session.
const PUBLIC_ACTION_FILES = new Set([join("src", "server", "auth", "actions.ts")]);

describe("admin authorisation", () => {
  it("every admin page calls requireAdmin()", () => {
    const pages = files(ADMIN_APP, /^page\.tsx$/);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) expect(readFileSync(page, "utf8"), page).toMatch(/await requireAdmin\(\)/);
  });

  it("the admin root layout checks the session before rendering", () => {
    expect(readFileSync(join(ADMIN_APP, "layout.tsx"), "utf8")).toMatch(/await requireAdmin\(\)/);
  });

  it("every exported server action outside sign-in/out calls requireAdmin()", () => {
    const actionFiles = files("src", /\.tsx?$/).filter((f) => /^\s*["']use server["']/m.test(readFileSync(f, "utf8")));
    for (const file of actionFiles) {
      if (PUBLIC_ACTION_FILES.has(file)) continue;
      const source = readFileSync(file, "utf8");
      const exported = [...source.matchAll(/export async function (\w+)\s*\(([\s\S]*?)\n}/g)];
      for (const [, name, body] of exported) {
        expect(body, `${file}: ${name}`).toMatch(/await requireAdmin\(\)/);
      }
    }
  });
});
