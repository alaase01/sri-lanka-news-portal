import { StaticPageRoute, staticPageMetadata } from "@/routes/static-page";

export const generateMetadata = () => staticPageMetadata("si", "about");

export default function Page() {
  return <StaticPageRoute locale="si" slug="about" />;
}
