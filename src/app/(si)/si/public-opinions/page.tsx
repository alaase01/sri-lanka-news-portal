import { PollsPage, pollsMetadata } from "@/routes/polls-pages";

export const metadata = pollsMetadata("si");

export default function Page() {
  return <PollsPage locale="si" />;
}
