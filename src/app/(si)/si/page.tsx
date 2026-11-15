import { HomePage, homeMetadata } from "@/routes/home-page";

export const metadata = homeMetadata("si");

export default function Page() {
  return <HomePage locale="si" />;
}
