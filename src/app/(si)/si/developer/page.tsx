import { DeveloperPage, developerMetadata } from "@/routes/developer-page";

export const metadata = developerMetadata("si");

export default function Page() {
  return <DeveloperPage locale="si" />;
}
