import { PollsPage, pollsMetadata } from "@/routes/polls-pages";

export const metadata = pollsMetadata("en");

export default function Page() {
  return <PollsPage locale="en" />;
}
