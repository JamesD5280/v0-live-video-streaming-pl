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
import type { Video, Destination, Stream, Playlist, Overlay } from "@/lib/store"
import {
  Radio, Play, Calendar, CheckCircle2, Clock, AlertCircle, StopCircle, Loader2,
  Film, ListMusic, Layers, Eye, EyeOff, Rss, Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"

const statusConfig: Record<string, { label: string; className: string; icon: typeof Radio }> = {
  live: { label: "LIVE", className: "bg-live/10 text-live border-live/20", icon: Radio },
  pending: { label: "Pending", className: "bg-warning/10 text-warning border-warning/20", icon: Calendar },
  completed: { label: "Completed", className: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle2 },
  stopped: { label: "Stopped", className: "bg-muted text-muted-foreground border-border", icon: Clock },
  error: { label: "Error", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertCircle },
}

type SourceType = "video" | "playlist" | "rtmp_pull"

export function StreamCreator() {
  const { data: videos, error: videosError } = useSWR<Video[]>("/api/videos", fetcher)
  const { data: destinations, error: destsError } = useSWR<Destination[]>("/api/destinations", fetcher)
  const { data: playlists } = useSWR<Playlist[]>("/api/playlists", fetcher)
  const { data: overlays } = useSWR<Overlay[]>("/api/overlays", fetcher)
  const { data: streams, error: streamsError, mutate: mutateStreams } = useSWR<Stream[]>("/api/streams", fetcher)

  const [sourceType, setSourceType] = useState<SourceType>("video")
  const [selectedVideo, setSelectedVideo] = useState("")
  const [selectedPlaylist, setSelectedPlaylist] = useState("")
  const [rtmpPullUrl, setRtmpPullUrl] = useState("")
  const [streamTitle, setStreamTitle] = useState("")
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>([])
  const [selectedOverlays, setSelectedOverlays] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [rtmpChecking, setRtmpChecking] = useState(false)
  const [rtmpCheckResult, setRtmpCheckResult] = useState<{ valid: boolean; error?: string; hasVideo?: boolean; hasAudio?: boolean } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const readyVideos = Array.isArray(videos) ? videos.filter((v) => v.status === "ready") : []
  const enabledDestinations = Array.isArray(destinations) ? destinations.filter((d) => d.enabled) : []
  const enabledOverlays = Array.isArray(overlays) ? overlays.filter((o) => o.enabled) : []
  const availablePlaylists = Array.isArray(playlists) ? playlists : []

  const toggleDestination = (id: string) => {
    setSelectedDestinations((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    )
  }

  const toggleOverlay = (id: string) => {
    setSelectedOverlays((prev) =>
      prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id]
    )
  }

  const hasSource = sourceType === "video" ? !!selectedVideo : sourceType === "playlist" ? !!selectedPlaylist : !!rtmpPullUrl.trim()
  const canStart = hasSource && streamTitle && selectedDestinations.length > 0

  const handleGoLive = async () => {
    setCreating(true)
    setStartError(null)
    try {
      const payload: Record<string, unknown> = {
        title: streamTitle,
        destination_ids: selectedDestinations,
        overlay_ids: selectedOverlays,
        go_live: true,
      }

      if (sourceType === "video") {
        payload.video_id = selectedVideo
      } else if (sourceType === "playlist") {
        payload.playlist_id = selectedPlaylist
      } else if (sourceType === "rtmp_pull") {
        payload.rtmp_pull_url = rtmpPullUrl.trim()
      }

      // 1. Create the stream record (will be "pending")
      const createRes = await fetch("/api/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const stream = await createRes.json()

      if (stream?.id) {
        // 2. Tell the engine to start -- this sets "live" only if successful
        const engineRes = await fetch("/api/streams/engine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", streamId: stream.id }),
        })
        const engineData = await engineRes.json()

        if (!engineData.success) {
          setStartError(engineData.error || "Streaming engine failed to start the stream")
        } else {
          // Only clear form on success
          setStreamTitle("")
          setSelectedVideo("")
          setSelectedPlaylist("")
          setRtmpPullUrl("")
          setSelectedDestinations([])
          setSelectedOverlays([])
        }
      } else {
        setStartError(stream?.error || "Failed to create stream record")
      }
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Failed to start stream")
    }
    setCreating(false)
    mutateStreams()
  }

  const handleStopStream = async (streamId: string) => {
    await fetch("/api/streams/engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop", streamId }),
    })
    mutateStreams()
  }

  const handleDeleteStream = async (streamId: string) => {
    await fetch(`/api/streams?id=${streamId}`, { method: "DELETE" })
    mutateStreams()
  }

  const handleDeleteAllStopped = async () => {
    if (!streams) return
    const stoppedStreams = streams.filter((s) => s.status === "stopped" || s.status === "completed")
    await Promise.all(stoppedStreams.map((s) => fetch(`/api/streams?id=${s.id}`, { method: "DELETE" })))
    mutateStreams()
  }

  const handleCheckRtmp = async () => {
    if (!rtmpPullUrl.trim()) return
    setRtmpChecking(true)
    setRtmpCheckResult(null)
    try {
      const res = await fetch("/api/streams/check-rtmp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: rtmpPullUrl.trim() }),
      })
      const data = await res.json()
      setRtmpCheckResult(data)
    } catch {
      setRtmpCheckResult({ valid: false, error: "Failed to check RTMP stream" })
    }
    setRtmpChecking(false)
  }

  const handlePreview = async () => {
    setPreviewing(true)
    setPreviewError(null)
    setPreviewUrl(null)
    try {
      const payload: Record<string, unknown> = { overlayIds: selectedOverlays }
      if (sourceType === "video") payload.videoId = selectedVideo
      else if (sourceType === "playlist") payload.playlistId = selectedPlaylist
      else if (sourceType === "rtmp_pull") payload.rtmpPullUrl = rtmpPullUrl.trim()

      const res = await fetch("/api/streams/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Preview failed" }))
        setPreviewError(err.error || "Preview generation failed")
      } else {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        setPreviewUrl(url)
      }
    } catch {
      setPreviewError("Failed to generate preview")
    }
    setPreviewing(false)
  }

  const stoppedCount = Array.isArray(streams) ? streams.filter((s) => s.status === "stopped" || s.status === "completed").length : 0

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

              {/* Source Type Toggle */}
              <div className="space-y-2">
                <Label className="text-foreground">Source</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={sourceType === "video" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSourceType("video")}
                  >
                    <Film className="h-3.5 w-3.5" />
                    Single Video
                  </Button>
                  <Button
                    type="button"
                    variant={sourceType === "playlist" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSourceType("playlist")}
                  >
                    <ListMusic className="h-3.5 w-3.5" />
                    Playlist
                  </Button>
                  <Button
                    type="button"
                    variant={sourceType === "rtmp_pull" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSourceType("rtmp_pull")}
                  >
                    <Rss className="h-3.5 w-3.5" />
                    RTMP Pull
                  </Button>
                </div>
              </div>

              {sourceType === "video" ? (
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
                  {readyVideos.length === 0 && (
                    <p className="text-xs text-muted-foreground">No videos ready. Upload videos from the Video Library.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-foreground">Select Playlist</Label>
                  <Select value={selectedPlaylist} onValueChange={setSelectedPlaylist}>
                    <SelectTrigger className="bg-secondary border-border text-foreground">
                      <SelectValue placeholder="Choose a playlist to stream" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {availablePlaylists.map((pl) => (
                        <SelectItem key={pl.id} value={pl.id}>
                          <span className="flex items-center gap-2">
                            {pl.name}
                            <span className="text-xs text-muted-foreground">
                              ({(pl.playlist_items || []).length} videos)
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availablePlaylists.length === 0 && (
                    <p className="text-xs text-muted-foreground">No playlists yet. Create one from the Playlists page.</p>
                  )}
                </div>
              )}

              {sourceType === "rtmp_pull" && (
                <div className="space-y-2">
                  <Label className="text-foreground">RTMP Source URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={rtmpPullUrl}
                      onChange={(e) => { setRtmpPullUrl(e.target.value); setRtmpCheckResult(null) }}
                      placeholder="rtmp://source-server.com/live/stream-key"
                      className="bg-secondary border-border text-foreground font-mono text-sm flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      disabled={!rtmpPullUrl.trim() || rtmpChecking}
                      onClick={handleCheckRtmp}
                    >
                      {rtmpChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rss className="h-3.5 w-3.5" />}
                      {rtmpChecking ? "Testing..." : "Test Stream"}
                    </Button>
                  </div>
                  {rtmpCheckResult && (
                    <div className={cn(
                      "rounded-lg border p-2.5 text-xs",
                      rtmpCheckResult.valid
                        ? "border-primary/30 bg-primary/5 text-primary"
                        : "border-destructive/30 bg-destructive/5 text-destructive"
                    )}>
                      {rtmpCheckResult.valid ? (
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Stream is active
                          {rtmpCheckResult.hasVideo && " (video"}
                          {rtmpCheckResult.hasVideo && rtmpCheckResult.hasAudio && " + audio)"}
                          {rtmpCheckResult.hasVideo && !rtmpCheckResult.hasAudio && " only)"}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {rtmpCheckResult.error || "Stream not reachable"}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Enter the RTMP URL and click Test Stream to verify it is active before going live.
                  </p>
                </div>
              )}

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

              {/* Overlays Section */}
              {enabledOverlays.length > 0 && (
                <div className="space-y-3">
                  <Label className="flex items-center gap-2 text-foreground">
                    <Layers className="h-4 w-4" />
                    Overlays (optional)
                  </Label>
                  <div className="space-y-2">
                    {enabledOverlays.map((overlay) => (
                      <div
                        key={overlay.id}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer",
                          selectedOverlays.includes(overlay.id)
                            ? "border-primary bg-primary/5"
                            : "border-border bg-secondary/50 hover:bg-secondary"
                        )}
                        onClick={() => toggleOverlay(overlay.id)}
                      >
                        <Checkbox
                          checked={selectedOverlays.includes(overlay.id)}
                          onCheckedChange={() => toggleOverlay(overlay.id)}
                        />
                        <div className="flex items-center gap-2">
                          {overlay.image_path ? (
                            <img src={overlay.image_path} alt="" className="h-8 w-8 rounded object-contain bg-secondary" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded bg-secondary">
                              {overlay.type === "text" || overlay.type === "lower_third" ? (
                                <span className="text-xs font-bold text-muted-foreground">Aa</span>
                              ) : (
                                <Layers className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{overlay.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {overlay.type === "text" || overlay.type === "lower_third"
                              ? overlay.text_content
                              : `${overlay.position} -- ${overlay.size_percent}%`}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                          {overlay.type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {startError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <p className="text-sm font-medium text-destructive">Failed to start stream</p>
                      <p className="mt-1 text-xs text-destructive/80">{startError}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview Player */}
              {previewUrl && (
                <div className="space-y-2">
                  <Label className="text-foreground">Stream Preview (5-second clip with overlays)</Label>
                  <div className="relative rounded-lg overflow-hidden border border-border bg-black">
                    <video
                      src={previewUrl}
                      controls
                      autoPlay
                      className="w-full aspect-video"
                      onEnded={() => {}}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This is a 5-second preview of how your stream will look with overlays applied.
                  </p>
                </div>
              )}
              {previewError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <p className="text-sm font-medium text-destructive">Preview failed</p>
                      <p className="mt-1 text-xs text-destructive/80">{previewError}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  disabled={!hasSource || previewing}
                  variant="outline"
                  onClick={handlePreview}
                  className="gap-2"
                >
                  {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  {previewing ? "Generating Preview..." : "Preview Stream"}
                </Button>
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
                  { step: "1", title: "Choose Source", desc: "Upload videos, create playlists, or pull an RTMP stream" },
                  { step: "2", title: "Add Overlays", desc: "Add logos, video overlays (.MOV), bugs, and text" },
                  { step: "3", title: "Configure Destinations", desc: "Select which platforms to stream to" },
                  { step: "4", title: "Go Live", desc: "Your content streams live with overlays applied" },
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-foreground">All Streams</CardTitle>
          {stoppedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground border-border"
              onClick={handleDeleteAllStopped}
            >
              <Trash2 className="h-3 w-3" />
              Delete Stopped ({stoppedCount})
            </Button>
          )}
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
                const sourceName = stream.rtmp_pull_url
                  ? `RTMP Pull: ${stream.rtmp_pull_url}`
                  : stream.playlist
                  ? `Playlist: ${stream.playlist.name}`
                  : stream.video?.title || "Unknown"
                const overlayCount = stream.stream_overlays?.length || 0
                return (
                  <div key={stream.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", stream.status === "live" ? "bg-live/10" : "bg-secondary")}>
                        <Icon className={cn("h-4 w-4", stream.status === "live" ? "text-live animate-pulse" : "text-muted-foreground")} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{stream.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {sourceName} | {destNames.join(", ") || "No destinations"}
                          {overlayCount > 0 && ` | ${overlayCount} overlay${overlayCount > 1 ? "s" : ""}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {(stream.status === "live" || stream.status === "pending" || stream.status === "error") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 border-destructive text-destructive hover:bg-destructive/10"
                          onClick={() => handleStopStream(stream.id)}
                        >
                          <StopCircle className="h-3.5 w-3.5" />
                          {stream.status === "live" ? "Stop" : "Dismiss"}
                        </Button>
                      )}
                      {(stream.status === "stopped" || stream.status === "completed") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteStream(stream.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
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
