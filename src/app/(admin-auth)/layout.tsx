import type { ReactNode } from "react";
import { AdminDocument, adminMetadata, adminViewport } from "@/components/admin/AdminDocument";

export const metadata = adminMetadata;
export const viewport = adminViewport;
export const instant = false;

/** Root layout for the admin sign-in page only. */
export default function AdminAuthLayout({ children }: { children: ReactNode }) {
  return <AdminDocument>{children}</AdminDocument>;
}
