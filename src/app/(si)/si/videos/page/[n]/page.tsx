import { VideoListPage, videoListMetadata, type VideoListProps } from "@/routes/videos-pages";

// Waits for its full render so a page past the end answers 404.
export const instant = false;

export const generateStaticParams = () => [{ n: "2" }];
export const generateMetadata = (props: VideoListProps) => videoListMetadata("si", props);

export default function Page(props: VideoListProps) {
  return <VideoListPage locale="si" {...props} />;
}
