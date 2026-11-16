import { VideoPage, videoMetadata, videoStaticParams, type VideoProps } from "@/routes/videos-pages";

// Waits for its full render so a missing video answers 404.
export const instant = false;

export const generateStaticParams = () => videoStaticParams("si");
export const generateMetadata = (props: VideoProps) => videoMetadata("si", props);

export default function Page(props: VideoProps) {
  return <VideoPage locale="si" {...props} />;
}
