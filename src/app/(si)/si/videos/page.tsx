import { VideoListPage, videoListMetadata } from "@/routes/videos-pages";

export const generateMetadata = () => videoListMetadata("si", {});

export default function Page() {
  return <VideoListPage locale="si" />;
}
