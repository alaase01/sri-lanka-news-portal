import type { PageVersionState } from "@/server/admin/pages";

export const PAGE_STATE_LABEL: Record<PageVersionState | "missing", string> = {
  missing: "Not started",
  notStarted: "Not started",
  draft: "Draft – not on the site",
  published: "Published",
  changed: "Published – unpublished changes",
};

const TONE: Record<PageVersionState | "missing", string> = {
  missing: "bg-soft text-muted border border-line",
  notStarted: "bg-soft text-muted border border-line",
  draft: "bg-notice text-notice-ink",
  published: "bg-[#e3f3e8] text-[#1d5b33]",
  changed: "bg-[#e6eefb] text-navy",
};

export function PageStateBadge({ state }: { state: PageVersionState | "missing" }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${TONE[state]}`}>{PAGE_STATE_LABEL[state]}</span>;
}
