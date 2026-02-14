import { createClient } from "@/lib/supabase/server"
import { TopHeader } from "@/components/top-header"
import { StatCards } from "@/components/dashboard/stat-cards"
import { RecentStreams } from "@/components/dashboard/recent-streams"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { PlatformHealth } from "@/components/dashboard/platform-health"

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: liveCount },
    { count: videoCount },
    { data: recentStreams },
    { data: destinations },
  ] = await Promise.all([
    supabase.from("streams").select("*", { count: "exact", head: true }).eq("status", "live"),
    supabase.from("videos").select("*", { count: "exact", head: true }),
    supabase
      .from("streams")
      .select("*, video:videos(*), stream_destinations(*, destination:destinations(*))")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("destinations").select("*").order("created_at", { ascending: false }),
  ])

  // Calculate total viewer count and stream hours
  const { data: allStreams } = await supabase.from("streams").select("viewer_count, started_at, ended_at")
  const totalViewers = (allStreams || []).reduce((sum, s) => sum + (s.viewer_count || 0), 0)
  const totalHours = (allStreams || []).reduce((sum, s) => {
    if (s.started_at) {
      const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now()
      return sum + (end - new Date(s.started_at).getTime()) / 3600000
    }
    return sum
  }, 0)

  return (
    <div className="flex flex-col">
      <TopHeader title="Dashboard" />
      <div className="flex-1 space-y-6 p-6">
        <StatCards
          liveCount={liveCount || 0}
          videoCount={videoCount || 0}
          totalViewers={totalViewers}
          totalHours={Math.round(totalHours * 10) / 10}
        />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecentStreams streams={recentStreams || []} />
          </div>
          <div className="space-y-6">
            <QuickActions />
          </div>
        </div>
        <PlatformHealth destinations={destinations || []} />
      </div>
    </div>
  )
}
