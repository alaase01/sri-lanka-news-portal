import { StaticPageRoute, staticPageMetadata } from "@/routes/static-page";

export const generateMetadata = () => staticPageMetadata("en", "privacy-policy");

export default function Page() {
  return <StaticPageRoute locale="en" slug="privacy-policy" />;
}
