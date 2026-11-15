"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { id: string; label: string; href: string };
type Props = { items: Item[]; homeHref: string; homeLabel: string };

function NavList({ items, homeHref, homeLabel, pathname }: Props & { pathname: string | null }) {
  const isHome = pathname === homeHref;
  const linkClass = (active: boolean) => `block px-4 py-3 text-white ${active ? "bg-brand" : "hover:bg-navy-line"}`;
  return (
    <ul className="hidden flex-wrap items-center text-[15px] font-semibold lg:flex">
      <li>
        <Link href={homeHref} aria-current={isHome ? "page" : undefined} className={linkClass(isHome)}>
          {homeLabel}
        </Link>
      </li>
      {items.map((item) => {
        const active = pathname !== null && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <li key={item.id}>
            <Link href={item.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Desktop navigation row with the current section marked. */
export function NavLinks(props: Props) {
  return <NavList {...props} pathname={usePathname()} />;
}

/** Same row with nothing marked: shown while the current path is not yet known. */
export function NavLinksFallback(props: Props) {
  return <NavList {...props} pathname={null} />;
}
