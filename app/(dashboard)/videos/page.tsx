import { TopHeader } from "@/components/top-header"
import { VideoUpload } from "@/components/videos/video-upload"
import { VideoList } from "@/components/videos/video-list"

export default function VideosPage() {
  return (
    <div className="flex flex-col">
      <TopHeader title="Video Library" />
      <div className="flex-1 space-y-6 p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Upload Videos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload pre-recorded videos to stream as live content across your destinations.
          </p>
        </div>
        <VideoUpload />
        <div>
          <h2 className="text-base font-semibold text-foreground">Your Videos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {`Manage your video library. Videos marked "Ready" can be used for streaming.`}
          </p>
        </div>
        <VideoList />
      </div>
    </div>
  )
}
