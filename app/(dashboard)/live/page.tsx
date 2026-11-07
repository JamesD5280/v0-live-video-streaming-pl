import { LiveNow } from "@/components/live-now"
import { TopHeader } from "@/components/top-header"

export default function LiveNowPage() {
  return (
    <div className="flex flex-col">
      <TopHeader title="Live Now" />
      <div className="flex-1 p-4 sm:p-6">
        <LiveNow />
      </div>
    </div>
  )
}
