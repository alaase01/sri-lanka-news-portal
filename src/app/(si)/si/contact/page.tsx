import { StaticPageRoute, staticPageMetadata } from "@/routes/static-page";

export const generateMetadata = () => staticPageMetadata("si", "contact");

export default function Page() {
  return <StaticPageRoute locale="si" slug="contact" />;
}
