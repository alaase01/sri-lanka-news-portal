import Link from "next/link";
import type { Crumb } from "@/server/services/content";

export function Breadcrumbs({ crumbs, homeHref, homeLabel }: { crumbs: Crumb[]; homeHref: string; homeLabel: string }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <Link href={homeHref} className="hover:text-brand-dark hover:underline">
            {homeLabel}
          </Link>
        </li>
        {crumbs.map((c) => (
          <li key={c.href} className="flex items-center gap-2">
            <span aria-hidden="true">›</span>
            <Link href={c.href} className="hover:text-brand-dark hover:underline">
              {c.name}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
