import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { aiEnv } from "@/config/env";
import { AI_LIMITS, findArticles, selectedArticle, usageWindow } from "@/server/ai/assistant";
import { categoryOptions } from "@/server/admin/articles";
import { AiAssistant } from "@/components/admin/AiAssistant";
import { LocaleText, Notice, PageHeader, StatusBadge, buttonPrimary, buttonSecondary, inputClass } from "@/components/admin/ui";

export const metadata: Metadata = { title: "AI Editorial Assistant" };
export const instant = false;

function requestTime(): Date {
  return new Date();
}

export default async function AiAssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 100) : "");
  const mode = one("mode") === "paste" ? "paste" : "article";
  const articleId = /^[a-z0-9]{1,40}$/i.test(one("article")) ? one("article") : "";
  const q = one("q");

  const configured = !!aiEnv.apiKey;
  const [usage, categories, articles, selected] = await Promise.all([
    usageWindow(admin.id, requestTime()),
    mode === "paste" ? categoryOptions() : Promise.resolve([]),
    mode === "article" && !articleId ? findArticles(q) : Promise.resolve([]),
    mode === "article" && articleId ? selectedArticle(articleId) : Promise.resolve(null),
  ]);

  const tab = (m: "article" | "paste", label: string) => (
    <Link
      href={m === "paste" ? "/admin/ai?mode=paste" : "/admin/ai"}
      aria-current={mode === m ? "page" : undefined}
      className={`rounded-t px-4 py-2 font-semibold ${mode === m ? "bg-white text-navy" : "text-muted hover:text-navy"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex max-w-7xl flex-col gap-5">
      <PageHeader title="AI Editorial Assistant" />
      <p className="max-w-3xl text-body">
        Rewrite, correct, translate and improve headlines with AI. Suggestions are never saved automatically: you review and edit them, then choose
        <strong> Approve and save</strong>. Published articles are never changed by the assistant. The assistant does not check facts; you remain responsible
        for accuracy.
      </p>
      {!configured && (
        <Notice tone="error">
          The assistant is not set up: no AI API key is configured on the server. Add ANTHROPIC_API_KEY to the server&apos;s .env file and restart the site.
        </Notice>
      )}

      <nav aria-label="Text source" className="flex gap-1 border-b border-line">
        {tab("article", "Existing article")}
        {tab("paste", "Paste text")}
      </nav>

      {mode === "article" && !selected && (
        <section className="flex flex-col gap-3 rounded-lg bg-white p-4" aria-labelledby="pick">
          <h2 id="pick" className="text-lg font-bold">Choose an article or draft</h2>
          {articleId && <Notice tone="error">That article was not found or is in the bin.</Notice>}
          <form method="get" role="search" className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold">
              Headline contains
              <input name="q" defaultValue={q} maxLength={100} className={inputClass + " font-sans"} />
            </label>
            <button type="submit" className={buttonPrimary}>Search</button>
          </form>
          {articles.length === 0 ? (
            <p className="text-muted">No articles found.</p>
          ) : (
            <ul className="divide-y divide-line">
              {articles.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    {(["si", "en"] as const).map((l) =>
                      a.versions[l] ? (
                        <span key={l} className="flex items-center gap-2">
                          <span className="w-6 text-xs font-bold uppercase text-muted">{l}</span>
                          <StatusBadge status={a.versions[l]!.status} />
                          <LocaleText locale={l} className="truncate">{a.versions[l]!.headline}</LocaleText>
                        </span>
                      ) : null,
                    )}
                  </div>
                  <Link href={`/admin/ai?article=${a.id}`} className={buttonSecondary + " inline-flex items-center"}>Use this article</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(mode === "paste" || selected) && (
        <AiAssistant
          key={selected?.id ?? "paste"}
          mode={mode}
          article={selected}
          categories={categories}
          configured={configured}
          limits={{ ...AI_LIMITS, hourly: aiEnv.hourlyLimit, daily: aiEnv.dailyLimit }}
          usage={usage}
        />
      )}
    </div>
  );
}
