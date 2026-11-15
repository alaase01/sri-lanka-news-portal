import Link from "next/link";
import type { CategoryNode } from "@/server/services/content";

/**
 * Quick access to the main sections. A swipeable chip row on phones (placed right
 * under the header), an even strip on desktop.
 */
export function QuickCategories({ categories, label, className }: { categories: CategoryNode[]; label: string; className?: string }) {
  if (categories.length === 0) return null;
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:gap-2.5 lg:overflow-visible lg:pb-0">
        {categories.map((c) => (
          <li key={c.id} className="shrink-0 lg:flex-1">
            <Link
              href={c.href}
              className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-full bg-white px-4 text-sm font-semibold hover:text-brand-dark lg:min-h-12 lg:rounded-md lg:text-base"
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
