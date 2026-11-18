import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/session";
import { getSettings } from "@/server/admin/settings";
import { adImageChoices } from "@/server/admin/ad-page-data";
import { env } from "@/config/env";
import { PageHeader } from "@/components/admin/ui";
import { SettingsForm } from "@/components/admin/SettingsForm";

export const metadata: Metadata = { title: "Settings" };
export const instant = false;

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  const images = await adImageChoices(settings.defaultShareMediaId ? [settings.defaultShareMediaId] : []);

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader title="Settings" />
      <section className="flex flex-col gap-2 rounded-lg bg-white p-4 text-sm">
        <h2 className="text-base font-bold">Publication</h2>
        <p>
          Name: <strong>RSnewslk.com</strong> · Website: <strong>{env.SITE_URL}</strong>
        </p>
        <p className="text-muted">
          The name is used in search results, the Google News sitemap and share previews. If you register with Google News, use exactly this name. The
          website address comes from the server setting SITE_URL.
        </p>
        <p>
          Google Search Console verification:{" "}
          <strong>{env.GOOGLE_SITE_VERIFICATION ? "HTML tag is set" : "not set (optional; DNS verification needs no setting)"}</strong>
        </p>
      </section>
      <SettingsForm initial={settings} images={images} />
    </div>
  );
}
