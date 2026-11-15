import type { ReactNode } from "react";
import { LocaleLayout, layoutMetadata, viewport } from "@/routes/locale-layout";

export { viewport };

// Every public page must render completely before the response starts, so that
// missing pages answer 404 and moved articles answer 308 instead of a 200 shell.
export const ensureStatic = "navigation";
export const metadata = layoutMetadata("si");

export default function Layout({ children }: { children: ReactNode }) {
  return <LocaleLayout locale="si">{children}</LocaleLayout>;
}
