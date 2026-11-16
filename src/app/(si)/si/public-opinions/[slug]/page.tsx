import { PollPage, pollMetadata, pollStaticParams, type PollProps } from "@/routes/polls-pages";

// Waits for its full render so a missing poll answers 404 (see the article route).
export const instant = false;

export const generateStaticParams = () => pollStaticParams("si");
export const generateMetadata = (props: PollProps) => pollMetadata("si", props);

export default function Page(props: PollProps) {
  return <PollPage locale="si" {...props} />;
}
