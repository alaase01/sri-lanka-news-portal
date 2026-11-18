import { StaticPageRoute, staticPageMetadata } from "@/routes/static-page";

export const generateMetadata = () => staticPageMetadata("en", "editorial-policy");

export default function Page() {
  return <StaticPageRoute locale="en" slug="editorial-policy" />;
}
