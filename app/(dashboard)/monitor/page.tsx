import { TopHeader } from "@/components/top-header"
import { StreamMonitor } from "@/components/monitor/stream-monitor"

export default function MonitorPage() {
  return (
    <div className="flex flex-col">
      <TopHeader title="Stream Monitor" />
      <div className="flex-1 p-6">
        <StreamMonitor />
      </div>
    </div>
  )
}
