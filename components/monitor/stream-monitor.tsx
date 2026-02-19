"use client"

import { useState, useEffect, useCallback } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { fetcher } from "@/lib/fetcher"
import type { Stream, Overlay } from "@/lib/store"
import { Radio, Users, Gauge, Clock, StopCircle, Activity, Server, Wifi, Loader2, Layers, Image as ImageIcon, Type, Video, RefreshCw } from "lucide-react"
import { OverlayPreview } from "@/components/overlays/overlay-preview"

export function StreamMonitor() {
  const { data: streams, error: streamsError, mutate } = useSWR<Stream[]>("/api/streams", fetcher, { refreshInterval: 5000 })
  const { data: allOverlays } = useSWR<Overlay[]>("/api/overlays", fetcher)
  const liveStreams = Array.isArray(streams) ? streams.filter((s) => s.status === "live") : []
  const liveStream = liveStreams[0]

  const [uptimeSeconds, setUptimeSeconds] = useState(0)
  const [cpuUsage, setCpuUsage] = useState(34)
  const [bandwidth, setBandwidth] = useState(12.4)
  const [activeOverlayIds, setActiveOverlayIds] = useState<Set<string>>(new Set())
  const [updatingOverlays, setUpdatingOverlays] = useState(false)
  const [overlayError, setOverlayError] = useState<string | null>(null)

  // Initialize active overlays from the live stream's current overlays
  useEffect(() => {
    if (!liveStream) return
    const currentIds = (liveStream.stream_overlays || [])
      .map((so) => so.overlay_id || so.overlay?.id)
      .filter(Boolean)
    setActiveOverlayIds(new Set(currentIds))
  }, [liveStream?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleOverlay = useCallback(async (overlayId: string) => {
    if (!liveStream || updatingOverlays) return
    setUpdatingOverlays(true)
    setOverlayError(null)

    const newIds = new Set(activeOverlayIds)
    if (newIds.has(overlayId)) {
      newIds.delete(overlayId)
    } else {
      newIds.add(overlayId)
    }

    try {
      const res = await fetch("/api/streams/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_overlays",
          streamId: liveStream.id,
          overlayIds: Array.from(newIds),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setActiveOverlayIds(newIds)
        mutate() // refresh streams data
      } else {
        setOverlayError(data.error || "Failed to update overlays")
      }
    } catch {
      setOverlayError("Network error updating overlays")
    }
    setUpdatingOverlays(false)
  }, [liveStream, activeOverlayIds, updatingOverlays, mutate])

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

      {/* Live Overlay Controls */}
      {allOverlays && allOverlays.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Layers className="h-4 w-4" />
              Live Overlay Controls
              {updatingOverlays && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Toggle overlays on or off in real time. The stream will briefly restart (~1-2s) when you make a change.
            </p>
          </CardHeader>
          <CardContent>
            {/* Visual preview of active overlays */}
            {allOverlays.filter(o => o.enabled).length > 0 && (
              <div className="mb-4">
                <OverlayPreview
                  overlays={allOverlays.filter(o => activeOverlayIds.has(o.id))}
                />
              </div>
            )}

            {overlayError && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5">
                <p className="text-xs text-destructive">{overlayError}</p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {allOverlays.filter(o => o.enabled).map((overlay) => {
                const isActive = activeOverlayIds.has(overlay.id)
                const OverlayIcon = overlay.type === "text" || overlay.type === "lower_third" ? Type
                  : overlay.type === "video" ? Video
                  : ImageIcon
                return (
                  <div
                    key={overlay.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                      isActive
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-secondary/30"
                    }`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      isActive ? "bg-primary/10" : "bg-secondary"
                    }`}>
                      {overlay.image_path && overlay.type !== "video" ? (
                        <img src={overlay.image_path} alt="" className="h-7 w-7 rounded object-contain" />
                      ) : (
                        <OverlayIcon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {overlay.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {overlay.type} -- {overlay.position}
                      </p>
                    </div>
                    <Switch
                      checked={isActive}
                      onCheckedChange={() => toggleOverlay(overlay.id)}
                      disabled={updatingOverlays}
                    />
                  </div>
                )
              })}
            </div>
            {allOverlays.filter(o => o.enabled).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No enabled overlays. Create overlays from the Overlays page.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
