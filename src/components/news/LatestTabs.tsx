"use client";

import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { ArticleCard } from "@/server/services/content";
import { ArticleRow } from "./ArticleCards";

type Tab = "latest" | "mostRead";

/** Latest News and Most Read as tabs. Both lists are in the HTML; the tab only toggles visibility. */
export function LatestTabs({
  latest,
  mostRead,
  locale,
  labels,
}: {
  latest: ArticleCard[];
  mostRead: ArticleCard[];
  locale: Locale;
  labels: { latest: string; mostRead: string };
}) {
  const [tab, setTab] = useState<Tab>("latest");
  const tabClass = (active: boolean) =>
    `min-h-12 flex-1 px-2 text-[15px] ${active ? "bg-brand font-bold text-white" : "bg-soft font-semibold text-navy hover:bg-placeholder"}`;

  return (
    <section className="overflow-hidden rounded-lg bg-white">
      <div role="tablist" className="flex">
        <button type="button" role="tab" id="tab-latest" aria-selected={tab === "latest"} aria-controls="panel-latest" onClick={() => setTab("latest")} className={tabClass(tab === "latest")}>
          {labels.latest}
        </button>
        <button type="button" role="tab" id="tab-most" aria-selected={tab === "mostRead"} aria-controls="panel-most" onClick={() => setTab("mostRead")} className={tabClass(tab === "mostRead")}>
          {labels.mostRead}
        </button>
      </div>

      <div role="tabpanel" id="panel-latest" aria-labelledby="tab-latest" hidden={tab !== "latest"} className="px-4 pb-2 pt-1">
        <ul className="divide-y divide-line">
          {latest.map((a) => (
            <li key={a.id}>
              <ArticleRow article={a} locale={locale} />
            </li>
          ))}
        </ul>
      </div>

      <div role="tabpanel" id="panel-most" aria-labelledby="tab-most" hidden={tab !== "mostRead"} className="px-4 pb-2 pt-1">
        <ol className="divide-y divide-line">
          {mostRead.map((a, i) => (
            <li key={a.id}>
              <Link href={a.href} className="group flex items-baseline gap-3.5 py-3.5">
                <span aria-hidden="true" className="font-latin text-[26px] font-extrabold leading-none text-brand">
                  {i + 1}
                </span>
                <span className="font-semibold leading-snug group-hover:text-brand-dark">{a.headline}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
