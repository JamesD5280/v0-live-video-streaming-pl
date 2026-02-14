"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Upload,
  Radio,
  MonitorPlay,
  Settings,
  Calendar,
  Globe,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import type { Stream } from "@/lib/store"

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Video Library", href: "/videos", icon: Upload },
  { name: "Destinations", href: "/destinations", icon: Globe },
  { name: "Streams", href: "/streams", icon: Radio },
  { name: "Schedule", href: "/schedule", icon: Calendar },
  { name: "Monitor", href: "/monitor", icon: MonitorPlay },
  { name: "Settings", href: "/settings", icon: Settings },
]

interface AppSidebarProps {
  userEmail?: string | null
  displayName?: string | null
  liveStreams?: Stream[]
}

export function AppSidebar({ userEmail, displayName, liveStreams = [] }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  const liveCount = liveStreams.filter((s) => s.status === "live").length

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Radio className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold text-foreground">2MStream</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {liveCount > 0 && (
        <div className="px-4 pb-2">
          <div className="rounded-lg bg-secondary p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-foreground">
                {liveCount} Stream{liveCount > 1 ? "s" : ""} Live
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Cloud server active</p>
          </div>
        </div>
      )}

      <div className="border-t border-border p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {displayName || "User"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {userEmail || ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Sign out</span>
          </Button>
        </div>
      </div>
    </aside>
  )
}
