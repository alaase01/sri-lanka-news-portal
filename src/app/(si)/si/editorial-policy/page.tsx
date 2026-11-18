import { StaticPageRoute, staticPageMetadata } from "@/routes/static-page";

export const generateMetadata = () => staticPageMetadata("si", "editorial-policy");

export default function Page() {
  return <StaticPageRoute locale="si" slug="editorial-policy" />;
}
