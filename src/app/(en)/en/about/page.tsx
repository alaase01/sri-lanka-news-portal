import { StaticPageRoute, staticPageMetadata } from "@/routes/static-page";

export const generateMetadata = () => staticPageMetadata("en", "about");

export default function Page() {
  return <StaticPageRoute locale="en" slug="about" />;
}
