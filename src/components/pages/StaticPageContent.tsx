import type { BodyDoc } from "@/lib/content/body";
import type { Locale } from "@/lib/i18n/config";
import { ArticleBody } from "@/components/article/ArticleBody";

/** The body of a static page. Shared by the public page and the admin preview so they look the same. */
export function StaticPageContent({ title, body, locale, updatedLabel }: { title: string; body: BodyDoc; locale: Locale; updatedLabel?: string | null }) {
  return (
    <>
      <header>
        <h1 className="text-3xl font-bold leading-snug sm:text-4xl" lang={locale}>
          {title}
        </h1>
        {updatedLabel && <p className="mt-2 text-sm text-muted">{updatedLabel}</p>}
      </header>
      <div className="article-body" lang={locale}>
        <ArticleBody body={body} />
      </div>
    </>
  );
}
