"use client"

import { useState } from "react"
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
import { demoVideos, demoDestinations, demoStreams, type Stream } from "@/lib/store"
import { Radio, Play, Calendar, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const statusConfig: Record<string, { label: string; className: string; icon: typeof Radio }> = {
  live: { label: "LIVE", className: "bg-live/10 text-live border-live/20", icon: Radio },
  scheduled: { label: "Scheduled", className: "bg-warning/10 text-warning border-warning/20", icon: Calendar },
  completed: { label: "Completed", className: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle2 },
  idle: { label: "Idle", className: "bg-muted text-muted-foreground border-border", icon: Clock },
  error: { label: "Error", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertCircle },
}

export function StreamCreator() {
  const [selectedVideo, setSelectedVideo] = useState("")
  const [streamTitle, setStreamTitle] = useState("")
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>([])
  const [streams] = useState<Stream[]>(demoStreams)

  const readyVideos = demoVideos.filter((v) => v.status === "ready")
  const enabledDestinations = demoDestinations.filter((d) => d.connected)

  const toggleDestination = (id: string) => {
    setSelectedDestinations((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    )
  }

  const canStart = selectedVideo && streamTitle && selectedDestinations.length > 0

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">
                Create New Stream
              </CardTitle>
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
                        {video.name} ({video.duration})
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
                        <p className="text-xs text-muted-foreground">{dest.serverUrl}</p>
                      </div>
                      <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                        {dest.platform}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  disabled={!canStart}
                  className="gap-2 bg-live text-foreground hover:bg-live/90"
                >
                  <Play className="h-4 w-4" />
                  Go Live Now
                </Button>
                <Button
                  disabled={!canStart}
                  variant="outline"
                  className="gap-2 border-border text-foreground hover:bg-secondary"
                >
                  <Calendar className="h-4 w-4" />
                  Schedule
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">
                How It Works
              </CardTitle>
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
          <CardTitle className="text-base font-semibold text-foreground">
            All Streams
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {streams.map((stream) => {
              const config = statusConfig[stream.status] || statusConfig.idle
              const Icon = config.icon
              const destNames = stream.destinations
                .map((dId) => demoDestinations.find((d) => d.id === dId)?.name)
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
                          stream.status === "live"
                            ? "text-live animate-pulse"
                            : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{stream.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {stream.videoName} | {destNames.join(", ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {stream.status === "live" && (
                      <div className="text-right">
                        <p className="text-xs font-mono text-foreground">{stream.viewers.toLocaleString()} viewers</p>
                        <p className="text-xs text-muted-foreground">{stream.uptime}</p>
                      </div>
                    )}
                    {stream.status === "scheduled" && stream.scheduledAt && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(stream.scheduledAt).toLocaleString()}
                      </p>
                    )}
                    <Badge variant="outline" className={cn("text-xs", config.className)}>
                      {config.label}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
