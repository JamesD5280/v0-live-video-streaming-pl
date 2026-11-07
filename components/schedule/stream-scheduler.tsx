"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetcher } from "@/lib/fetcher"
import type { Video, Destination, ScheduledEvent, Overlay } from "@/lib/store"
import { Calendar, Clock, Plus, Trash2, Video as VideoIcon, Radio, Repeat, Loader2, Rss, Film, Layers, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"

function toLocalDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function toLocalTimeInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

export function StreamScheduler() {
  const { data: videos } = useSWR<Video[]>("/api/videos", fetcher)
  const { data: destinations } = useSWR<Destination[]>("/api/destinations", fetcher)
  const { data: overlays } = useSWR<Overlay[]>("/api/overlays", fetcher)
  const { data: events, error: eventsError, mutate } = useSWR<ScheduledEvent[]>("/api/schedule", fetcher)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [timeZone, setTimeZone] = useState("your local timezone")

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "your local timezone")
  }, [])
  const [newEvent, setNewEvent] = useState({
    title: "",
    videoId: "",
    sourceType: "video" as "video" | "rtmp_pull",
    rtmpPullUrl: "",
    destinations: [] as string[],
    overlayIds: [] as string[],
    date: "",
    time: "",
    repeat: "none",
  })

  const readyVideos = Array.isArray(videos) ? videos.filter((v) => v.status === "ready") : []
  const enabledDests = Array.isArray(destinations) ? destinations.filter((d) => d.enabled) : []
  const enabledOverlays = Array.isArray(overlays) ? overlays.filter((o) => o.enabled) : []

  const toggleDest = (id: string) => {
    setNewEvent((prev) => ({
      ...prev,
      destinations: prev.destinations.includes(id)
        ? prev.destinations.filter((d) => d !== id)
        : [...prev.destinations, id],
    }))
  }

  const toggleOverlay = (id: string) => {
    setNewEvent((prev) => ({
      ...prev,
      overlayIds: prev.overlayIds.includes(id)
        ? prev.overlayIds.filter((o) => o !== id)
        : [...prev.overlayIds, id],
    }))
  }

  const resetForm = () => {
    setNewEvent({ title: "", videoId: "", sourceType: "video", rtmpPullUrl: "", destinations: [], overlayIds: [], date: "", time: "", repeat: "none" })
    setEditingId(null)
    setScheduleError(null)
    setShowForm(false)
  }

  const startEdit = (event: ScheduledEvent) => {
    const scheduledDate = new Date(event.scheduled_at)
    setNewEvent({
      title: event.title,
      videoId: event.video_id || "",
      sourceType: event.source_type as "video" | "rtmp_pull",
      rtmpPullUrl: event.rtmp_pull_url || "",
      destinations: event.event_destinations?.map((ed) => ed.destination_id) || [],
      overlayIds: event.event_overlays?.map((eo) => eo.overlay_id) || [],
      date: toLocalDateInput(scheduledDate),
      time: toLocalTimeInput(scheduledDate),
      repeat: event.repeat_mode || "none",
    })
    setEditingId(event.id)
    setScheduleError(null)
    setShowForm(true)
  }

  const saveEvent = async () => {
    setScheduleError(null)
    const localDate = new Date(`${newEvent.date}T${newEvent.time}:00`)
    if (!newEvent.title.trim()) {
      setScheduleError("Enter a stream title.")
      return
    }
    if (Number.isNaN(localDate.getTime())) {
      setScheduleError("Choose a valid date and time.")
      return
    }
    if (localDate.getTime() <= Date.now()) {
      setScheduleError("Choose a time in the future.")
      return
    }
    if (newEvent.destinations.length === 0) {
      setScheduleError("Select at least one destination.")
      return
    }
    if (newEvent.sourceType === "rtmp_pull") {
      try {
        const sourceUrl = new URL(newEvent.rtmpPullUrl)
        if (sourceUrl.protocol !== "rtmp:" && sourceUrl.protocol !== "rtmps:") {
          setScheduleError("RTMP sources must use rtmp:// or rtmps://.")
          return
        }
      } catch {
        setScheduleError("Enter a valid RTMP source URL.")
        return
      }
    }

    setSaving(true)
    const scheduledAt = localDate.toISOString()
    const body = {
      title: newEvent.title,
      source_type: newEvent.sourceType,
      video_id: newEvent.sourceType === "video" ? newEvent.videoId : undefined,
      rtmp_pull_url: newEvent.sourceType === "rtmp_pull" ? newEvent.rtmpPullUrl : undefined,
      scheduled_at: scheduledAt,
      repeat_mode: newEvent.repeat,
      destination_ids: newEvent.destinations,
      overlay_ids: newEvent.overlayIds,
    }

    try {
      if (editingId) {
        // Update existing event
        const res = await fetch("/api/schedule", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...body }),
        })
        if (!res.ok) {
          const err = await res.json()
          console.error("Schedule update failed:", err)
          setScheduleError(err.error || "Failed to update schedule.")
          setSaving(false)
          return
        }
      } else {
        // Create new event
        const res = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          console.error("Schedule create failed:", err)
          setScheduleError(err.error || "Failed to create schedule.")
          setSaving(false)
          return
        }
      }
    } catch (e) {
      console.error("Schedule save error:", e)
      setScheduleError("Failed to save schedule. Please try again.")
      setSaving(false)
      return
    }
    
    resetForm()
    setSaving(false)
    mutate()
  }

  const removeEvent = async (id: string) => {
    await fetch(`/api/schedule?id=${id}`, { method: "DELETE" })
    mutate()
  }

  const getDaysUntil = (dateStr: string) => {
    const now = new Date()
    const target = new Date(dateStr)
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate())
    const diffDays = Math.round((targetDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 0) return "Today"
    if (diffDays === 1) return "Tomorrow"
    return `In ${diffDays} days`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Scheduled Streams</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule your streams in advance. They will automatically start at the configured time.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="h-3.5 w-3.5" />
          Schedule Stream
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/20 bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              {editingId ? "Edit Scheduled Stream" : "New Scheduled Stream"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-foreground">Stream Title</Label>
                <Input
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="Title for the scheduled stream"
                  className="bg-secondary border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Source Type</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={newEvent.sourceType === "video" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setNewEvent({ ...newEvent, sourceType: "video" })}
                  >
                    <Film className="h-3.5 w-3.5" />
                    Video File
                  </Button>
                  <Button
                    type="button"
                    variant={newEvent.sourceType === "rtmp_pull" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setNewEvent({ ...newEvent, sourceType: "rtmp_pull" })}
                  >
                    <Rss className="h-3.5 w-3.5" />
                    RTMP Pull
                  </Button>
                </div>
              </div>
            </div>
            {newEvent.sourceType === "video" ? (
              <div className="space-y-2">
                <Label className="text-foreground">Video</Label>
                <Select value={newEvent.videoId} onValueChange={(val) => setNewEvent({ ...newEvent, videoId: val })}>
                  <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue placeholder="Select video" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {readyVideos.map((video) => (
                      <SelectItem key={video.id} value={video.id}>{video.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-foreground">RTMP Source URL</Label>
                <Input
                  value={newEvent.rtmpPullUrl}
                  onChange={(e) => setNewEvent({ ...newEvent, rtmpPullUrl: e.target.value })}
                  placeholder="rtmp://source-server.com/live/stream-key"
                  className="bg-secondary border-border text-foreground font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the RTMP URL of the stream to pull and restream at the scheduled time.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-foreground">Date</Label>
                <Input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} className="bg-secondary border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Time</Label>
                <Input type="time" value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })} className="bg-secondary border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Repeat</Label>
                <Select value={newEvent.repeat} onValueChange={(val) => setNewEvent({ ...newEvent, repeat: val })}>
                  <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="none">No Repeat</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Times use {timeZone}. Start timing follows your deployment&apos;s supported cron interval and may be delayed by the execution window.
            </p>
            <div className="space-y-2">
              <Label className="text-foreground">Destinations</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {enabledDests.map((dest) => (
                  <div
                    key={dest.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      newEvent.destinations.includes(dest.id) ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:bg-secondary"
                    )}
                    onClick={() => toggleDest(dest.id)}
                  >
                    <Checkbox checked={newEvent.destinations.includes(dest.id)} onCheckedChange={() => toggleDest(dest.id)} />
                    <span className="text-sm text-foreground">{dest.name}</span>
                  </div>
                ))}
              </div>
            </div>
            {enabledOverlays.length > 0 && (
              <div className="space-y-2">
                <Label className="text-foreground flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  Overlays
                </Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {enabledOverlays.map((overlay) => (
                    <div
                      key={overlay.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                        newEvent.overlayIds.includes(overlay.id) ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:bg-secondary"
                      )}
                      onClick={() => toggleOverlay(overlay.id)}
                    >
                      <Checkbox checked={newEvent.overlayIds.includes(overlay.id)} onCheckedChange={() => toggleOverlay(overlay.id)} />
                      <div>
                        <span className="text-sm text-foreground">{overlay.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{overlay.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {scheduleError && (
              <p role="alert" className="text-sm text-destructive">{scheduleError}</p>
            )}
            <div className="flex gap-2">
              <Button onClick={saveEvent} disabled={!newEvent.title.trim() || (newEvent.sourceType === "video" ? !newEvent.videoId : !newEvent.rtmpPullUrl.trim()) || !newEvent.date || !newEvent.time || newEvent.destinations.length === 0 || saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingId ? "Update" : "Schedule"}
              </Button>
              <Button variant="outline" className="border-border text-foreground" onClick={resetForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {eventsError ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-destructive" />
          <p className="mt-3 text-sm font-medium text-foreground">Failed to load schedule</p>
          <p className="mt-1 text-xs text-muted-foreground">Please try refreshing the page</p>
        </div>
      ) : !events ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">No scheduled streams</p>
          <p className="mt-1 text-xs text-muted-foreground">Schedule your first stream to automate your broadcasts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const destNames = (event.event_destinations || []).map((ed) => ed.destination?.name).filter(Boolean)
            return (
              <Card key={event.id} className="border-border bg-card">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10">
                      <Calendar className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{event.title}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs capitalize",
                            event.status === "error"
                              ? "border-destructive/30 text-destructive"
                              : event.status === "completed"
                                ? "border-primary/30 text-primary"
                                : "border-border text-muted-foreground"
                          )}
                        >
                          {event.status}
                        </Badge>
                        {event.repeat_mode !== "none" && (
                          <Badge variant="outline" className="gap-1 text-xs text-muted-foreground border-border">
                            <Repeat className="h-3 w-3" />
                            {event.repeat_mode}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {event.source_type === "rtmp_pull" ? <Rss className="h-3 w-3" /> : <VideoIcon className="h-3 w-3" />}
                          {event.source_type === "rtmp_pull" ? `RTMP: ${event.rtmp_pull_url}` : (event.video?.title || "Unknown")}
                        </span>
                        <span className="flex items-center gap-1"><Radio className="h-3 w-3" />{destNames.join(", ") || "No destinations"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {new Date(event.scheduled_at).toLocaleDateString()} at {new Date(event.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="text-xs text-muted-foreground">{getDaysUntil(event.scheduled_at)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => startEdit(event)}>
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Edit schedule</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeEvent(event.id)}>
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove schedule</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
