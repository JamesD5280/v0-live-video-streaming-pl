import { Radio, Upload, Eye, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface StatCardsProps {
  liveCount: number
  videoCount: number
  totalViewers: number
  totalHours: number
}

export function StatCards({ liveCount, videoCount, totalViewers, totalHours }: StatCardsProps) {
  const stats = [
    {
      label: "Active Streams",
      value: liveCount.toString(),
      description: liveCount > 0 ? "Currently streaming" : "No active streams",
      icon: Radio,
      accent: "text-live",
      bgAccent: "bg-live/10",
    },
    {
      label: "Videos Uploaded",
      value: videoCount.toString(),
      description: "In your library",
      icon: Upload,
      accent: "text-primary",
      bgAccent: "bg-primary/10",
    },
    {
      label: "Total Viewers",
      value: totalViewers.toLocaleString(),
      description: "Across all streams",
      icon: Eye,
      accent: "text-chart-2",
      bgAccent: "bg-chart-2/10",
    },
    {
      label: "Stream Hours",
      value: `${totalHours}h`,
      description: "Total streaming time",
      icon: Clock,
      accent: "text-warning",
      bgAccent: "bg-warning/10",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-border bg-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bgAccent}`}>
                <stat.icon className={`h-4 w-4 ${stat.accent}`} />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
