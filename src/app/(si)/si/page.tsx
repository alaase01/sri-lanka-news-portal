import { HomePage, homeMetadata } from "@/routes/home-page";

export const generateMetadata = () => homeMetadata("si");

export default function Page() {
  return <HomePage locale="si" />;
}
