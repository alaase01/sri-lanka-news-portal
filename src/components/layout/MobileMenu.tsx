"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Item = { id: string; label: string; href: string; children: { id: string; label: string; href: string }[] };

export function MobileMenu({
  items,
  homeHref,
  labels,
}: {
  items: Item[];
  homeHref: string;
  labels: { home: string; menu: string; close: string; mainMenu: string };
}) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? labels.close : labels.menu}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center text-white"
      >
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <nav
        id="mobile-menu"
        aria-label={labels.mainMenu}
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 max-h-[75vh] overflow-y-auto border-t border-navy-line bg-navy px-4 py-2 shadow-lg"
      >
        <ul>
          <li>
            <Link href={homeHref} onClick={close} className="block py-3 font-semibold text-white">
              {labels.home}
            </Link>
          </li>
          {items.map((item) => (
            <li key={item.id} className="border-t border-navy-line">
              <Link href={item.href} onClick={close} className="block py-3 font-semibold text-white">
                {item.label}
              </Link>
              {item.children.length > 0 && (
                <ul className="pb-2 pl-4">
                  {item.children.map((child) => (
                    <li key={child.id}>
                      <Link href={child.href} onClick={close} className="block py-2 text-navy-soft">
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
