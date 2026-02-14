import { createClient } from "@/lib/supabase/server"
import { AppSidebar } from "@/components/app-sidebar"
import type { Stream } from "@/lib/store"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  let liveStreams: Stream[] = []

  if (user) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()
    profile = profileData

    const { data: streamsData } = await supabase
      .from("streams")
      .select("*")
      .eq("status", "live")
    liveStreams = (streamsData || []) as Stream[]
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        userEmail={user?.email}
        displayName={profile?.display_name}
        liveStreams={liveStreams}
      />
      <main className="ml-64 flex-1">{children}</main>
    </div>
  )
}
