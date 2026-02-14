import { TopHeader } from "@/components/top-header"
import { StreamScheduler } from "@/components/schedule/stream-scheduler"

export default function SchedulePage() {
  return (
    <div className="flex flex-col">
      <TopHeader title="Schedule" />
      <div className="flex-1 p-6">
        <StreamScheduler />
      </div>
    </div>
  )
}
