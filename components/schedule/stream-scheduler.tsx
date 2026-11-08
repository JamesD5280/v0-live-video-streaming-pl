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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { fetcher } from "@/lib/fetcher"
import type { Video, Destination, ScheduledEvent, Overlay, Playlist } from "@/lib/store"
import { Calendar, Clock, Plus, Trash2, Video as VideoIcon, Radio, Repeat, Loader2, Rss, Film, ListVideo, Layers, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/language-provider"

type ScheduleSourceType = "video" | "playlist" | "rtmp_pull"

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
  const { locale, t } = useLanguage()
  const { data: videos } = useSWR<Video[]>("/api/videos", fetcher)
  const { data: playlists } = useSWR<Playlist[]>("/api/playlists", fetcher)
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
    playlistId: "",
    sourceType: "video" as ScheduleSourceType,
    rtmpPullUrl: "",
    destinations: [] as string[],
    overlayIds: [] as string[],
    date: "",
    time: "",
    repeat: "none",
  })

  const readyVideos = Array.isArray(videos) ? videos.filter((v) => v.status === "ready") : []
  const readyPlaylists = Array.isArray(playlists)
    ? playlists.filter((playlist) => {
        const items = playlist.playlist_items || []
        return items.length > 0 && items.every((item) => {
          const relationVideo = item.video as Video | Video[] | null | undefined
          const video = Array.isArray(relationVideo) ? relationVideo[0] : relationVideo
          return video?.status === "ready"
        })
      })
    : []
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
    setNewEvent({ title: "", videoId: "", playlistId: "", sourceType: "video", rtmpPullUrl: "", destinations: [], overlayIds: [], date: "", time: "", repeat: "none" })
    setEditingId(null)
    setScheduleError(null)
    setShowForm(false)
  }

  const startEdit = (event: ScheduledEvent) => {
    const scheduledDate = new Date(event.scheduled_at)
    setNewEvent({
      title: event.title,
      videoId: event.video_id || "",
      playlistId: event.playlist_id || "",
      sourceType: event.source_type,
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
      setScheduleError(t("Enter a stream title."))
      return
    }
    if (Number.isNaN(localDate.getTime())) {
      setScheduleError(t("Choose a valid date and time."))
      return
    }
    if (localDate.getTime() <= Date.now()) {
      setScheduleError(t("Choose a time in the future."))
      return
    }
    if (newEvent.destinations.length === 0) {
      setScheduleError(t("Select at least one destination."))
      return
    }
    if (newEvent.sourceType === "video" && !newEvent.videoId) {
      setScheduleError(t("Select a video source."))
      return
    }
    if (newEvent.sourceType === "playlist" && !newEvent.playlistId) {
      setScheduleError(t("Select a playlist source."))
      return
    }
    if (newEvent.sourceType === "rtmp_pull") {
      try {
        const sourceUrl = new URL(newEvent.rtmpPullUrl)
        if (sourceUrl.protocol !== "rtmp:" && sourceUrl.protocol !== "rtmps:") {
          setScheduleError(t("RTMP sources must use rtmp:// or rtmps://."))
          return
        }
      } catch {
        setScheduleError(t("Enter a valid RTMP source URL."))
        return
      }
    }

    setSaving(true)
    const scheduledAt = localDate.toISOString()
    const body = {
      title: newEvent.title,
      source_type: newEvent.sourceType,
      video_id: newEvent.sourceType === "video" ? newEvent.videoId : null,
      playlist_id: newEvent.sourceType === "playlist" ? newEvent.playlistId : null,
      rtmp_pull_url: newEvent.sourceType === "rtmp_pull" ? newEvent.rtmpPullUrl : null,
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
          setScheduleError(t(err.error || "Failed to update schedule."))
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
          setScheduleError(t(err.error || "Failed to create schedule."))
          setSaving(false)
          return
        }
      }
    } catch (e) {
      console.error("Schedule save error:", e)
      setScheduleError(t("Failed to save schedule. Please try again."))
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
    if (diffDays <= 0) return t("Today")
    if (diffDays === 1) return t("Tomorrow")
    return locale === "fr" ? `Dans ${diffDays} jours` : `In ${diffDays} days`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("Scheduled Streams")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Schedule your streams in advance. They will automatically start at the configured time.")}
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("Schedule Stream")}
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/20 bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              {t(editingId ? "Edit Scheduled Stream" : "New Scheduled Stream")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-foreground">{t("Stream Title")}</Label>
                <Input
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder={t("Title for the scheduled stream")}
                  className="bg-secondary border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">{t("Source Type")}</Label>
                <ToggleGroup
                  type="single"
                  value={newEvent.sourceType}
                  onValueChange={(value) => {
                    if (value) setNewEvent((prev) => ({ ...prev, sourceType: value as ScheduleSourceType }))
                  }}
                  variant="outline"
                  size="sm"
                  aria-label="Source type"
                  className="flex-wrap justify-start"
                >
                  <ToggleGroupItem value="video" aria-label="Video file" className="gap-1.5">
                    <Film className="h-3.5 w-3.5" />
                    {t("Video File")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="playlist" aria-label="Video playlist" className="gap-1.5">
                    <ListVideo className="h-3.5 w-3.5" />
                    {t("Playlist")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="rtmp_pull" aria-label="RTMP pull" className="gap-1.5">
                    <Rss className="h-3.5 w-3.5" />
                    {t("RTMP Pull")}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
            {newEvent.sourceType === "video" ? (
              <div className="space-y-2">
                <Label htmlFor="scheduled-video-source" className="text-foreground">Video</Label>
                <Select value={newEvent.videoId} onValueChange={(val) => setNewEvent({ ...newEvent, videoId: val })}>
                  <SelectTrigger id="scheduled-video-source" className="bg-secondary border-border text-foreground"><SelectValue placeholder={t("Select video")} /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectGroup>
                      {readyVideos.map((video) => (
                        <SelectItem key={video.id} value={video.id}>{video.title}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            ) : newEvent.sourceType === "playlist" ? (
              <div className="space-y-2">
                <Label htmlFor="scheduled-playlist-source" className="text-foreground">Video playlist</Label>
                <Select value={newEvent.playlistId} onValueChange={(val) => setNewEvent({ ...newEvent, playlistId: val })}>
                  <SelectTrigger id="scheduled-playlist-source" className="bg-secondary border-border text-foreground">
                    <SelectValue placeholder={t(playlists ? "No ready playlists" : "Loading playlists")} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectGroup>
                      {readyPlaylists.map((playlist) => (
                        <SelectItem key={playlist.id} value={playlist.id}>
                          {playlist.name} ({playlist.playlist_items?.length} videos)
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {playlists && readyPlaylists.length === 0
                    ? t("Create a playlist with at least one ready video before scheduling it.")
                    : t("Plays the playlist in order and follows its loop setting. Every video must be ready.")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="scheduled-rtmp-source" className="text-foreground">{t("RTMP Source URL")}</Label>
                <Input
                  id="scheduled-rtmp-source"
                  value={newEvent.rtmpPullUrl}
                  onChange={(e) => setNewEvent({ ...newEvent, rtmpPullUrl: e.target.value })}
                  placeholder="rtmp://source-server.com/live/stream-key"
                  className="bg-secondary border-border text-foreground font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t("Enter the RTMP URL of the stream to pull and restream at the scheduled time.")}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-foreground">{t("Date")}</Label>
                <Input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} className="bg-secondary border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">{t("Time")}</Label>
                <Input type="time" value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })} className="bg-secondary border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">{t("Repeat")}</Label>
                <Select value={newEvent.repeat} onValueChange={(val) => setNewEvent({ ...newEvent, repeat: val })}>
                  <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="none">{t("No Repeat")}</SelectItem>
                    <SelectItem value="daily">{t("Daily")}</SelectItem>
                    <SelectItem value="weekly">{t("Weekly")}</SelectItem>
                    <SelectItem value="monthly">{t("Monthly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("Times use")} {timeZone}. {t("Start timing follows your deployment&apos;s supported cron interval and may be delayed by the execution window.")}
            </p>
            <div className="space-y-2">
              <Label className="text-foreground">{t("Destinations")}</Label>
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
                  {t("Overlays")}
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
              <Button onClick={saveEvent} disabled={!newEvent.title.trim() || (newEvent.sourceType === "video" ? !newEvent.videoId : newEvent.sourceType === "playlist" ? !newEvent.playlistId : !newEvent.rtmpPullUrl.trim()) || !newEvent.date || !newEvent.time || newEvent.destinations.length === 0 || saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t(editingId ? "Update" : "Schedule")}
              </Button>
              <Button variant="outline" className="border-border text-foreground" onClick={resetForm}>{t("Cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {eventsError ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-destructive" />
          <p className="mt-3 text-sm font-medium text-foreground">{t("Failed to load schedule")}</p>
          <p className="mt-1 text-xs text-muted-foreground">Please try refreshing the page</p>
        </div>
      ) : !events ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">{t("No scheduled streams")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("Schedule your first stream to automate your broadcasts")}</p>
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
                          {t(event.status)}
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
                          {event.source_type === "rtmp_pull" ? (
                            <Rss className="h-3 w-3" />
                          ) : event.source_type === "playlist" ? (
                            <ListVideo className="h-3 w-3" />
                          ) : (
                            <VideoIcon className="h-3 w-3" />
                          )}
                          {event.source_type === "rtmp_pull"
                            ? `RTMP: ${event.rtmp_pull_url}`
                            : event.source_type === "playlist"
                              ? `Playlist: ${event.playlist?.name || "Unavailable"}`
                              : event.video?.title || "Unknown"}
                        </span>
                        <span className="flex items-center gap-1"><Radio className="h-3 w-3" />{destNames.join(", ") || "No destinations"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {new Date(event.scheduled_at).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US")} {t("at")} {new Date(event.scheduled_at).toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="text-xs text-muted-foreground">{getDaysUntil(event.scheduled_at)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => startEdit(event)}>
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">{t("Edit schedule")}</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeEvent(event.id)}>
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">{t("Remove schedule")}</span>
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
