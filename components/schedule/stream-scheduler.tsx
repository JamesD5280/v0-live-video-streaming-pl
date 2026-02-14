"use client"

import { useState } from "react"
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
import type { Video, Destination, ScheduledEvent } from "@/lib/store"
import { Calendar, Clock, Plus, Trash2, Video as VideoIcon, Radio, Repeat, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function StreamScheduler() {
  const { data: videos, error: videosError } = useSWR<Video[]>("/api/videos", fetcher)
  const { data: destinations, error: destsError } = useSWR<Destination[]>("/api/destinations", fetcher)
  const { data: events, error: eventsError, mutate } = useSWR<ScheduledEvent[]>("/api/schedule", fetcher)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newEvent, setNewEvent] = useState({
    title: "",
    videoId: "",
    destinations: [] as string[],
    date: "",
    time: "",
    repeat: "none",
  })

  const readyVideos = Array.isArray(videos) ? videos.filter((v) => v.status === "ready") : []
  const enabledDests = Array.isArray(destinations) ? destinations.filter((d) => d.enabled) : []

  const toggleDest = (id: string) => {
    setNewEvent((prev) => ({
      ...prev,
      destinations: prev.destinations.includes(id)
        ? prev.destinations.filter((d) => d !== id)
        : [...prev.destinations, id],
    }))
  }

  const addEvent = async () => {
    setSaving(true)
    const scheduledAt = new Date(`${newEvent.date}T${newEvent.time}:00`).toISOString()
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newEvent.title,
        video_id: newEvent.videoId,
        scheduled_at: scheduledAt,
        repeat_mode: newEvent.repeat,
        destination_ids: newEvent.destinations,
      }),
    })
    setNewEvent({ title: "", videoId: "", destinations: [], date: "", time: "", repeat: "none" })
    setShowForm(false)
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
    const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diff <= 0) return "Today"
    if (diff === 1) return "Tomorrow"
    return `In ${diff} days`
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
            <CardTitle className="text-base font-semibold text-foreground">New Scheduled Stream</CardTitle>
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
            </div>
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
            <div className="flex gap-2">
              <Button onClick={addEvent} disabled={!newEvent.title || !newEvent.videoId || !newEvent.date || !newEvent.time || saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Schedule
              </Button>
              <Button variant="outline" className="border-border text-foreground" onClick={() => setShowForm(false)}>Cancel</Button>
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
                        {event.repeat_mode !== "none" && (
                          <Badge variant="outline" className="gap-1 text-xs text-muted-foreground border-border">
                            <Repeat className="h-3 w-3" />
                            {event.repeat_mode}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><VideoIcon className="h-3 w-3" />{event.video?.title || "Unknown"}</span>
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
