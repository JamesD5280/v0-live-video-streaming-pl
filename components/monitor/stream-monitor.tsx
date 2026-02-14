"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { demoStreams, demoDestinations } from "@/lib/store"
import {
  Radio,
  Users,
  Gauge,
  Clock,
  StopCircle,
  Activity,
  Server,
  Wifi,
} from "lucide-react"

export function StreamMonitor() {
  const liveStream = demoStreams.find((s) => s.status === "live")
  const [viewers, setViewers] = useState(liveStream?.viewers ?? 0)
  const [uptimeSeconds, setUptimeSeconds] = useState(4530)
  const [cpuUsage, setCpuUsage] = useState(34)
  const [bandwidth, setBandwidth] = useState(12.4)

  useEffect(() => {
    const interval = setInterval(() => {
      setViewers((prev) => Math.max(0, prev + Math.floor(Math.random() * 20 - 8)))
      setUptimeSeconds((prev) => prev + 1)
      setCpuUsage(Math.max(10, Math.min(80, 34 + Math.random() * 10 - 5)))
      setBandwidth(Math.max(5, Math.min(25, 12.4 + Math.random() * 3 - 1.5)))
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const formatUptime = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  if (!liveStream) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <Radio className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 text-lg font-medium text-foreground">No Active Streams</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a stream from the Streams page to see live monitoring here.
          </p>
        </CardContent>
      </Card>
    )
  }

  const destNames = liveStream.destinations
    .map((dId) => demoDestinations.find((d) => d.id === dId))
    .filter(Boolean)

  return (
    <div className="space-y-6">
      {/* Live stream header */}
      <Card className="border-live/20 bg-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-live/10">
                <Radio className="h-7 w-7 text-live animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">{liveStream.title}</h2>
                  <Badge className="bg-live text-foreground border-none">LIVE</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {liveStream.videoName}
                </p>
              </div>
            </div>
            <Button variant="outline" className="gap-2 border-destructive text-destructive hover:bg-destructive/10">
              <StopCircle className="h-4 w-4" />
              Stop Stream
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Viewers</p>
                <p className="text-xl font-bold text-foreground font-mono">{viewers.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Uptime</p>
                <p className="text-xl font-bold text-foreground font-mono">{formatUptime(uptimeSeconds)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-2/10">
                <Gauge className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bitrate</p>
                <p className="text-xl font-bold text-foreground font-mono">{liveStream.bitrate} kbps</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-live/10">
                <Activity className="h-5 w-5 text-live" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Destinations</p>
                <p className="text-xl font-bold text-foreground font-mono">{liveStream.destinations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Destination health */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Destination Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {destNames.map((dest) => {
              if (!dest) return null
              const health = 95 + Math.random() * 5
              return (
                <div key={dest.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-success" />
                      <span className="text-sm font-medium text-foreground">{dest.name}</span>
                    </div>
                    <span className="text-xs font-mono text-success">{health.toFixed(1)}%</span>
                  </div>
                  <Progress value={health} className="h-1.5" />
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Cloud Server Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-primary" />
                  <span className="text-sm text-foreground">CPU Usage</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{cpuUsage.toFixed(1)}%</span>
              </div>
              <Progress value={cpuUsage} className="h-1.5" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-chart-2" />
                  <span className="text-sm text-foreground">Bandwidth</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{bandwidth.toFixed(1)} Mbps</span>
              </div>
              <Progress value={(bandwidth / 50) * 100} className="h-1.5" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-warning" />
                  <span className="text-sm text-foreground">Memory</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">2.1 / 8 GB</span>
              </div>
              <Progress value={26} className="h-1.5" />
            </div>

            <div className="rounded-lg bg-secondary/50 p-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs font-medium text-foreground">Server Status: Healthy</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Region: US-East | Instance: stream-prod-1
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
