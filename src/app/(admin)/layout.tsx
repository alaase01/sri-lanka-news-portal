import type { ReactNode } from "react";
import { AdminDocument, adminMetadata, adminViewport } from "@/components/admin/AdminDocument";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/server/auth/session";

export const metadata = adminMetadata;
export const viewport = adminViewport;
export const instant = false;

/**
 * Root layout for every signed-in admin page. The session is checked here,
 * before any HTML is produced, so a signed-out visitor receives a real 307
 * redirect to the login page and not a single byte of the admin interface.
 * Pages and server actions still call requireAdmin() themselves.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <AdminDocument>
      <AdminShell email={admin.email}>{children}</AdminShell>
    </AdminDocument>
  );
}
