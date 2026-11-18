import { StaticPageRoute, staticPageMetadata } from "@/routes/static-page";

export const generateMetadata = () => staticPageMetadata("si", "privacy-policy");

export default function Page() {
  return <StaticPageRoute locale="si" slug="privacy-policy" />;
}
