import { VideoListPage, videoListMetadata } from "@/routes/videos-pages";

export const generateMetadata = () => videoListMetadata("en", {});

export default function Page() {
  return <VideoListPage locale="en" />;
}
