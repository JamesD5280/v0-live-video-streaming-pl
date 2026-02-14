import { TopHeader } from "@/components/top-header"
import { StatCards } from "@/components/dashboard/stat-cards"
import { RecentStreams } from "@/components/dashboard/recent-streams"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { PlatformHealth } from "@/components/dashboard/platform-health"

export default function DashboardPage() {
  return (
    <div className="flex flex-col">
      <TopHeader title="Dashboard" />
      <div className="flex-1 space-y-6 p-6">
        <StatCards />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecentStreams />
          </div>
          <div className="space-y-6">
            <QuickActions />
          </div>
        </div>
        <PlatformHealth />
      </div>
    </div>
  )
}
