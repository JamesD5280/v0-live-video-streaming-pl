import { TopHeader } from "@/components/top-header"
import { StreamCreator } from "@/components/streams/stream-creator"

export default function StreamsPage() {
  return (
    <div className="flex flex-col">
      <TopHeader title="Streams" />
      <div className="flex-1 p-6">
        <StreamCreator />
      </div>
    </div>
  )
}
