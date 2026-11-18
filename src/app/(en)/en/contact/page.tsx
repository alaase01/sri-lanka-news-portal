import { StaticPageRoute, staticPageMetadata } from "@/routes/static-page";

export const generateMetadata = () => staticPageMetadata("en", "contact");

export default function Page() {
  return <StaticPageRoute locale="en" slug="contact" />;
}
