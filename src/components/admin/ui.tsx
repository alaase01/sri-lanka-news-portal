import Link from "next/link";
import type { ReactNode } from "react";

/** Small shared pieces for admin screens. Server-safe (no hooks). */

export const inputClass = "mt-1 w-full rounded border border-muted bg-white px-3 py-2 text-base text-ink";
export const buttonPrimary = "min-h-10 rounded bg-navy px-4 font-bold text-white hover:bg-navy-deep disabled:opacity-60";
export const buttonSecondary = "min-h-10 rounded border border-navy bg-white px-4 font-semibold text-navy hover:bg-soft disabled:opacity-60";
export const buttonDanger = "min-h-10 rounded border border-brand-dark bg-white px-4 font-semibold text-brand-dark hover:bg-[#fdecee] disabled:opacity-60";

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  HIDDEN: "Unpublished",
  ARCHIVED: "Archived",
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-soft text-body",
  IN_REVIEW: "bg-notice text-notice-ink",
  SCHEDULED: "bg-[#e3ecff] text-[#1d3d8f]",
  PUBLISHED: "bg-[#e1f4e8] text-[#14532d]",
  HIDDEN: "bg-[#fdecee] text-brand-dark",
  ARCHIVED: "bg-soft text-muted",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-muted ring-1 ring-line">Not written</span>;
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? ""}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "ok", children }: { tone?: "ok" | "error"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded px-4 py-3 font-semibold ${tone === "error" ? "bg-[#fdecee] text-brand-dark" : "bg-[#e1f4e8] text-[#14532d]"}`}>
      {children}
    </p>
  );
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
      {page > 1 ? <Link className={buttonSecondary + " inline-flex items-center"} href={href(page - 1)}>← Newer</Link> : null}
      <span className="text-muted">Page {page} of {pages}</span>
      {page < pages ? <Link className={buttonSecondary + " inline-flex items-center"} href={href(page + 1)}>Older →</Link> : null}
    </nav>
  );
}

/** Text in either language, with the Sinhala font when needed. */
export function LocaleText({ locale, children, className = "" }: { locale: "si" | "en"; children: ReactNode; className?: string }) {
  return (
    <span lang={locale} className={(locale === "si" ? "font-sans " : "") + className}>
      {children}
    </span>
  );
}

export const LOCALE_NAME = { si: "Sinhala", en: "English" } as const;
