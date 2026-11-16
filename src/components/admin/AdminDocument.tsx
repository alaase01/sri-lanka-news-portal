import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/noto-sans-sinhala";
import "@/app/globals.css";

export const adminMetadata: Metadata = {
  title: { default: "Admin", template: "%s | RSnewslk.com admin" },
  // The admin area must never appear in search results.
  robots: { index: false, follow: false, nocache: true },
};

export const adminViewport: Viewport = { themeColor: "#0b1f3a", width: "device-width", initialScale: 1 };

/** The <html> document shared by the two admin root layouts. */
export function AdminDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface font-latin text-ink antialiased">{children}</body>
    </html>
  );
}
