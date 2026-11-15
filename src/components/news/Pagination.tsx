import Link from "next/link";

export function Pagination({
  basePath,
  page,
  hasNext,
  labels,
}: {
  basePath: string;
  page: number;
  hasNext: boolean;
  labels: { newer: string; older: string };
}) {
  if (page === 1 && !hasNext) return null;
  const href = (n: number) => (n <= 1 ? basePath : `${basePath}/page/${n}`);
  const button = "flex min-h-11 items-center rounded bg-white px-4 font-semibold hover:text-brand-dark";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={button}>
          ‹ {labels.newer}
        </Link>
      ) : (
        <span />
      )}
      {hasNext && (
        <Link href={href(page + 1)} rel="next" className={button}>
          {labels.older} ›
        </Link>
      )}
    </nav>
  );
}
