import Link from "next/link";

export function SectionHeading({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-l-[5px] border-brand pl-3">
      <h2 className="text-[22px] font-bold leading-snug">{title}</h2>
      {href && linkLabel && (
        <Link href={href} className="shrink-0 text-sm font-semibold text-brand-dark hover:underline">
          {linkLabel}
          <span className="sr-only">: {title}</span>
        </Link>
      )}
    </div>
  );
}
