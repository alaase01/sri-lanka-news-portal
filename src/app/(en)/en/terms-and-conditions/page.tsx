import { StaticPageRoute, staticPageMetadata } from "@/routes/static-page";

export const generateMetadata = () => staticPageMetadata("en", "terms-and-conditions");

export default function Page() {
  return <StaticPageRoute locale="en" slug="terms-and-conditions" />;
}
