import { DeveloperPage, developerMetadata } from "@/routes/developer-page";

export const metadata = developerMetadata("en");

export default function Page() {
  return <DeveloperPage locale="en" />;
}
