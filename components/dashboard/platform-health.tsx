"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { demoDestinations } from "@/lib/store"
import { cn } from "@/lib/utils"

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

export function PlatformHealth() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">Destinations Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {demoDestinations.map((dest) => (
          <div
            key={dest.id}
            className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold",
                  platformColors[dest.platform]
                )}
              >
                {platformIcons[dest.platform]}
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
                  dest.connected ? "bg-success" : "bg-destructive"
                )}
              />
              <span className="text-xs text-muted-foreground">
                {dest.connected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
