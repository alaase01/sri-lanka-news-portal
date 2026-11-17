import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/server/auth/actions";
import { Wordmark } from "@/components/layout/Wordmark";

/** Sections of the admin portal. Entries without `href` are not built yet and shown as such. */
const NAV: { label: string; href?: string }[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Articles", href: "/admin/articles" },
  { label: "Categories", href: "/admin/categories" },
  { label: "Tags", href: "/admin/tags" },
  { label: "Media", href: "/admin/media" },
  { label: "Videos", href: "/admin/videos" },
  { label: "Public opinions", href: "/admin/polls" },
  { label: "Comments", href: "/admin/comments" },
  { label: "Homepage", href: "/admin/homepage" },
  { label: "Advertisements", href: "/admin/ads" },
  { label: "Settings" },
];

export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="on-dark bg-navy text-white lg:w-60 lg:shrink-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:block">
          <Link href="/admin" aria-label="Admin dashboard">
            <Wordmark className="text-xl" />
          </Link>
          <p className="text-xs text-navy-soft lg:mt-1">Admin</p>
        </div>
        <nav aria-label="Admin sections" className="overflow-x-auto border-t border-navy-line lg:border-0">
          <ul className="flex gap-1 px-2 py-2 lg:flex-col lg:px-3">
            {NAV.map((item) => (
              <li key={item.label} className="shrink-0">
                {item.href ? (
                  <Link href={item.href} className="block rounded px-3 py-2 text-sm font-semibold hover:bg-navy-line">
                    {item.label}
                  </Link>
                ) : (
                  <span className="block cursor-default rounded px-3 py-2 text-sm text-[#9fb0c8]" title="Not built yet">
                    {item.label} <span className="text-xs">· soon</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 lg:px-8">
          <a href="/si" target="_blank" rel="noopener" className="text-sm font-semibold text-navy hover:underline">
            View site ↗
          </a>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">{email}</span>
            <form action={logoutAction}>
              <button type="submit" className="min-h-10 rounded border border-navy px-3 font-semibold hover:bg-soft">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
