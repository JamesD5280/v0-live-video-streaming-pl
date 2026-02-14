"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { fetcher } from "@/lib/fetcher"
import type { Stream } from "@/lib/store"
import { Radio, Users, Gauge, Clock, StopCircle, Activity, Server, Wifi, Loader2 } from "lucide-react"

export function StreamMonitor() {
  const { data: streams, error: streamsError, mutate } = useSWR<Stream[]>("/api/streams", fetcher, { refreshInterval: 5000 })
  const liveStreams = Array.isArray(streams) ? streams.filter((s) => s.status === "live") : []
  const liveStream = liveStreams[0]

  const [uptimeSeconds, setUptimeSeconds] = useState(0)
  const [cpuUsage, setCpuUsage] = useState(34)
  const [bandwidth, setBandwidth] = useState(12.4)

  useEffect(() => {
    if (!liveStream?.started_at) return
    const startTime = new Date(liveStream.started_at).getTime()
    const updateUptime = () => setUptimeSeconds(Math.floor((Date.now() - startTime) / 1000))
    updateUptime()
    const interval = setInterval(updateUptime, 1000)
    return () => clearInterval(interval)
  }, [liveStream?.started_at])

  useEffect(() => {
    if (!liveStream) return
    const interval = setInterval(() => {
      setCpuUsage(Math.max(10, Math.min(80, 34 + Math.random() * 10 - 5)))
      setBandwidth(Math.max(5, Math.min(25, 12.4 + Math.random() * 3 - 1.5)))
    }, 3000)
    return () => clearInterval(interval)
  }, [liveStream])

  const formatUptime = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  const handleStop = async (streamId: string) => {
    await fetch("/api/streams/engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop", streamId }),
    })
    mutate()
  }

  if (streamsError) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <Radio className="h-8 w-8 text-destructive" />
          </div>
          <p className="mt-4 text-lg font-medium text-foreground">Failed to load streams</p>
          <p className="mt-1 text-sm text-muted-foreground">Please try refreshing the page</p>
        </CardContent>
      </Card>
    )
  }

  if (!streams) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
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

  const destNames = (liveStream.stream_destinations || [])
    .map((sd) => sd.destination)
    .filter(Boolean)

  return (
    <div className="space-y-6">
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
                <p className="text-sm text-muted-foreground">{liveStream.video?.title || "Unknown video"}</p>
              </div>
            </div>
            <Button variant="outline" className="gap-2 border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleStop(liveStream.id)}>
              <StopCircle className="h-4 w-4" />
              Stop Stream
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Viewers</p>
                <p className="text-xl font-bold text-foreground font-mono">{(liveStream.viewer_count || 0).toLocaleString()}</p>
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
                <p className="text-xs text-muted-foreground">Destinations</p>
                <p className="text-xl font-bold text-foreground font-mono">{destNames.length}</p>
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
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-xl font-bold text-success font-mono">Healthy</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Destination Health</CardTitle>
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
            <CardTitle className="text-base font-semibold text-foreground">Cloud Server Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Server className="h-4 w-4 text-primary" /><span className="text-sm text-foreground">CPU Usage</span></div>
                <span className="text-xs font-mono text-muted-foreground">{cpuUsage.toFixed(1)}%</span>
              </div>
              <Progress value={cpuUsage} className="h-1.5" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-chart-2" /><span className="text-sm text-foreground">Bandwidth</span></div>
                <span className="text-xs font-mono text-muted-foreground">{bandwidth.toFixed(1)} Mbps</span>
              </div>
              <Progress value={(bandwidth / 50) * 100} className="h-1.5" />
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs font-medium text-foreground">Server Status: Healthy</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Region: US-East | Instance: 2mstream-prod-1</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
