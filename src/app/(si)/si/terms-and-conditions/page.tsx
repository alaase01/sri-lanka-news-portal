import { StaticPageRoute, staticPageMetadata } from "@/routes/static-page";

export const generateMetadata = () => staticPageMetadata("si", "terms-and-conditions");

export default function Page() {
  return <StaticPageRoute locale="si" slug="terms-and-conditions" />;
}
