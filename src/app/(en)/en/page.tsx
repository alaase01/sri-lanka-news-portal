import { HomePage, homeMetadata } from "@/routes/home-page";

export const generateMetadata = () => homeMetadata("en");

export default function Page() {
  return <HomePage locale="en" />;
}
