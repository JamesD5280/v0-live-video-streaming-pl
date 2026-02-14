"use client"

import { Radio, Upload, Eye, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const stats = [
  {
    label: "Active Streams",
    value: "1",
    change: "+1 from yesterday",
    icon: Radio,
    accent: "text-live",
    bgAccent: "bg-live/10",
  },
  {
    label: "Videos Uploaded",
    value: "4",
    change: "+2 this week",
    icon: Upload,
    accent: "text-primary",
    bgAccent: "bg-primary/10",
  },
  {
    label: "Total Viewers",
    value: "5,139",
    change: "+23% vs last week",
    icon: Eye,
    accent: "text-chart-2",
    bgAccent: "bg-chart-2/10",
  },
  {
    label: "Stream Hours",
    value: "18.4h",
    change: "This month",
    icon: Clock,
    accent: "text-warning",
    bgAccent: "bg-warning/10",
  },
]

export function StatCards() {
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
            <p className="mt-1 text-xs text-muted-foreground">{stat.change}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
