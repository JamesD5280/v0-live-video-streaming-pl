"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, Radio, Globe, Calendar } from "lucide-react"
import Link from "next/link"

const actions = [
  {
    label: "Upload Video",
    description: "Add a new video to your library",
    href: "/videos",
    icon: Upload,
    accent: "bg-primary/10 text-primary",
  },
  {
    label: "Start Stream",
    description: "Go live from a pre-recorded video",
    href: "/streams",
    icon: Radio,
    accent: "bg-live/10 text-live",
  },
  {
    label: "Add Destination",
    description: "Connect a new streaming platform",
    href: "/destinations",
    icon: Globe,
    accent: "bg-chart-2/10 text-chart-2",
  },
  {
    label: "Schedule Stream",
    description: "Plan a future live broadcast",
    href: "/schedule",
    icon: Calendar,
    accent: "bg-warning/10 text-warning",
  },
]

export function QuickActions() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3 transition-colors hover:bg-secondary"
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${action.accent}`}>
              <action.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{action.label}</p>
              <p className="text-xs text-muted-foreground">{action.description}</p>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
