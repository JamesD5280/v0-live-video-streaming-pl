"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { fetcher } from "@/lib/fetcher"
import type { Video, Destination, Stream } from "@/lib/store"
import { Radio, Play, Calendar, CheckCircle2, Clock, AlertCircle, StopCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const statusConfig: Record<string, { label: string; className: string; icon: typeof Radio }> = {
  live: { label: "LIVE", className: "bg-live/10 text-live border-live/20", icon: Radio },
  pending: { label: "Pending", className: "bg-warning/10 text-warning border-warning/20", icon: Calendar },
  completed: { label: "Completed", className: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle2 },
  stopped: { label: "Stopped", className: "bg-muted text-muted-foreground border-border", icon: Clock },
  error: { label: "Error", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertCircle },
}

export function StreamCreator() {
  const { data: videos, error: videosError } = useSWR<Video[]>("/api/videos", fetcher)
  const { data: destinations, error: destsError } = useSWR<Destination[]>("/api/destinations", fetcher)
  const { data: streams, error: streamsError, mutate: mutateStreams } = useSWR<Stream[]>("/api/streams", fetcher)
  const [selectedVideo, setSelectedVideo] = useState("")
  const [streamTitle, setStreamTitle] = useState("")
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const readyVideos = Array.isArray(videos) ? videos.filter((v) => v.status === "ready") : []
  const enabledDestinations = Array.isArray(destinations) ? destinations.filter((d) => d.enabled) : []

  const toggleDestination = (id: string) => {
    setSelectedDestinations((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    )
  }

  const canStart = selectedVideo && streamTitle && selectedDestinations.length > 0

  const handleGoLive = async () => {
    setCreating(true)
    await fetch("/api/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_id: selectedVideo,
        title: streamTitle,
        destination_ids: selectedDestinations,
        go_live: true,
      }),
    })
    setStreamTitle("")
    setSelectedVideo("")
    setSelectedDestinations([])
    setCreating(false)
    mutateStreams()
  }

  const handleStopStream = async (streamId: string) => {
    await fetch("/api/streams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: streamId, status: "stopped" }),
    })
    mutateStreams()
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">Create New Stream</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">Stream Title</Label>
                <Input
                  value={streamTitle}
                  onChange={(e) => setStreamTitle(e.target.value)}
                  placeholder="Give your stream a title..."
                  className="bg-secondary border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Select Video</Label>
                <Select value={selectedVideo} onValueChange={setSelectedVideo}>
                  <SelectTrigger className="bg-secondary border-border text-foreground">
                    <SelectValue placeholder="Choose a video to stream" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {readyVideos.map((video) => (
                      <SelectItem key={video.id} value={video.id}>
                        {video.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <Label className="text-foreground">Destinations</Label>
                <div className="space-y-2">
                  {enabledDestinations.map((dest) => (
                    <div
                      key={dest.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer",
                        selectedDestinations.includes(dest.id)
                          ? "border-primary bg-primary/5"
                          : "border-border bg-secondary/50 hover:bg-secondary"
                      )}
                      onClick={() => toggleDestination(dest.id)}
                    >
                      <Checkbox
                        checked={selectedDestinations.includes(dest.id)}
                        onCheckedChange={() => toggleDestination(dest.id)}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{dest.name}</p>
                        <p className="text-xs text-muted-foreground">{dest.rtmp_url}</p>
                      </div>
                      <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                        {dest.platform}
                      </Badge>
                    </div>
                  ))}
                  {enabledDestinations.length === 0 && (
                    <p className="text-sm text-muted-foreground">No enabled destinations. Add one from the Destinations page.</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  disabled={!canStart || creating}
                  onClick={handleGoLive}
                  className="gap-2 bg-live text-foreground hover:bg-live/90"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Go Live Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { step: "1", title: "Upload Video", desc: "Upload your pre-recorded video to the cloud" },
                  { step: "2", title: "Configure Destinations", desc: "Select which platforms to stream to" },
                  { step: "3", title: "Go Live", desc: "Your video streams as live - no computer needed" },
                ].map((item) => (
                  <div key={item.step} className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {item.step}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">All Streams</CardTitle>
        </CardHeader>
        <CardContent>
          {!streams ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : streams.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Radio className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No streams yet. Create one above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {streams.map((stream) => {
                const config = statusConfig[stream.status] || statusConfig.stopped
                const Icon = config.icon
                const destNames = (stream.stream_destinations || [])
                  .map((sd) => sd.destination?.name)
                  .filter(Boolean)
                return (
                  <div key={stream.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", stream.status === "live" ? "bg-live/10" : "bg-secondary")}>
                        <Icon className={cn("h-4 w-4", stream.status === "live" ? "text-live animate-pulse" : "text-muted-foreground")} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{stream.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {stream.video?.title || "Unknown"} | {destNames.join(", ") || "No destinations"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {stream.status === "live" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 border-destructive text-destructive hover:bg-destructive/10"
                          onClick={() => handleStopStream(stream.id)}
                        >
                          <StopCircle className="h-3.5 w-3.5" />
                          Stop
                        </Button>
                      )}
                      <Badge variant="outline" className={cn("text-xs", config.className)}>
                        {config.label}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
