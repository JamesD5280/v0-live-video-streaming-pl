import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Radio, Clock, CheckCircle2, Calendar, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Stream } from "@/lib/store"

const statusConfig: Record<string, { label: string; className: string; icon: typeof Radio }> = {
  live: { label: "LIVE", className: "bg-live/10 text-live border-live/20", icon: Radio },
  pending: { label: "Pending", className: "bg-warning/10 text-warning border-warning/20", icon: Calendar },
  completed: { label: "Completed", className: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle2 },
  stopped: { label: "Stopped", className: "bg-muted text-muted-foreground border-border", icon: Clock },
  error: { label: "Error", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
}

interface RecentStreamsProps {
  streams: Stream[]
}

export function RecentStreams({ streams }: RecentStreamsProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">Recent Streams</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {streams.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Radio className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No streams yet</p>
            <p className="text-xs text-muted-foreground">Create your first stream to get started</p>
          </div>
        ) : (
          streams.map((stream) => {
            const config = statusConfig[stream.status] || statusConfig.stopped
            const Icon = config.icon
            const destNames = (stream.stream_destinations || [])
              .map((sd) => sd.destination?.name)
              .filter(Boolean)
            return (
              <div
                key={stream.id}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      stream.status === "live" ? "bg-live/10" : "bg-secondary"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        stream.status === "live" ? "text-live animate-pulse" : "text-muted-foreground"
                      )}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{stream.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {destNames.length > 0 ? destNames.join(", ") : "No destinations"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {stream.status === "live" && (
                    <span className="text-xs font-mono text-muted-foreground">
                      {(stream.viewer_count || 0).toLocaleString()} viewers
                    </span>
                  )}
                  <Badge variant="outline" className={cn("text-xs", config.className)}>
                    {config.label}
                  </Badge>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
