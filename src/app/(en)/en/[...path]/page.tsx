import { ContentPage, contentMetadata, contentStaticParams, type ContentProps } from "@/routes/content-page";

// This route deliberately waits for its full render before responding, so a missing
// page answers 404 and a moved article answers 308. That rules out an instant shell,
// so instant-navigation validation is switched off here. Pages are still prerendered
// and cached; only the first visit to a new URL waits.
export const instant = false;

export const generateStaticParams = () => contentStaticParams("en");
export const generateMetadata = (props: ContentProps) => contentMetadata("en", props);

export default function Page(props: ContentProps) {
  return <ContentPage locale="en" {...props} />;
}
