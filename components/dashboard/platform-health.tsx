import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Destination } from "@/lib/store"

const platformIcons: Record<string, string> = {
  youtube: "YT",
  twitch: "TW",
  facebook: "FB",
  custom: "RT",
}

const platformColors: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-400",
  twitch: "bg-purple-500/10 text-purple-400",
  facebook: "bg-blue-500/10 text-blue-400",
  custom: "bg-orange-500/10 text-orange-400",
}

interface PlatformHealthProps {
  destinations: Destination[]
}

export function PlatformHealth({ destinations }: PlatformHealthProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">Destinations Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {destinations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Globe className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No destinations configured</p>
            <p className="text-xs text-muted-foreground">Add a streaming destination to get started</p>
          </div>
        ) : (
          destinations.map((dest) => (
            <div
              key={dest.id}
              className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold",
                    platformColors[dest.platform] || platformColors.custom
                  )}
                >
                  {platformIcons[dest.platform] || "RT"}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{dest.name}</p>
                  <p className="text-xs text-muted-foreground">{dest.platform}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    dest.enabled ? "bg-success" : "bg-destructive"
                  )}
                />
                <span className="text-xs text-muted-foreground">
                  {dest.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
