"use client"

import { useState } from "react"
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
import { demoVideos, demoDestinations } from "@/lib/store"
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Video,
  Radio,
  Repeat,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ScheduledEvent {
  id: string
  title: string
  videoName: string
  destinations: string[]
  date: string
  time: string
  repeat: string
}

const demoEvents: ScheduledEvent[] = [
  {
    id: "e1",
    title: "Weekly Podcast Stream",
    videoName: "Weekly Tech Podcast Ep. 47",
    destinations: ["Main YouTube Channel", "Facebook Gaming Page"],
    date: "2026-02-14",
    time: "18:00",
    repeat: "Weekly",
  },
  {
    id: "e2",
    title: "Gaming Highlights Premiere",
    videoName: "Gaming Tournament Highlights",
    destinations: ["Twitch - streamforge_official"],
    date: "2026-02-15",
    time: "20:00",
    repeat: "None",
  },
  {
    id: "e3",
    title: "Morning Yoga Session",
    videoName: "Product Launch Keynote 2026",
    destinations: ["Main YouTube Channel"],
    date: "2026-02-16",
    time: "07:00",
    repeat: "Daily",
  },
]

export function StreamScheduler() {
  const [events, setEvents] = useState<ScheduledEvent[]>(demoEvents)
  const [showForm, setShowForm] = useState(false)
  const [newEvent, setNewEvent] = useState({
    title: "",
    videoId: "",
    destinations: [] as string[],
    date: "",
    time: "",
    repeat: "None",
  })

  const readyVideos = demoVideos.filter((v) => v.status === "ready")

  const removeEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  const toggleDest = (id: string) => {
    setNewEvent((prev) => ({
      ...prev,
      destinations: prev.destinations.includes(id)
        ? prev.destinations.filter((d) => d !== id)
        : [...prev.destinations, id],
    }))
  }

  const addEvent = () => {
    const video = demoVideos.find((v) => v.id === newEvent.videoId)
    const destNames = newEvent.destinations
      .map((dId) => demoDestinations.find((d) => d.id === dId)?.name)
      .filter(Boolean) as string[]

    const event: ScheduledEvent = {
      id: `e${Date.now()}`,
      title: newEvent.title,
      videoName: video?.name ?? "Unknown",
      destinations: destNames,
      date: newEvent.date,
      time: newEvent.time,
      repeat: newEvent.repeat,
    }
    setEvents((prev) => [...prev, event])
    setNewEvent({ title: "", videoId: "", destinations: [], date: "", time: "", repeat: "None" })
    setShowForm(false)
  }

  const getDaysUntil = (dateStr: string) => {
    const today = new Date("2026-02-13")
    const target = new Date(dateStr)
    const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return "Today"
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
            <CardTitle className="text-base font-semibold text-foreground">
              New Scheduled Stream
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
                <Label className="text-foreground">Video</Label>
                <Select
                  value={newEvent.videoId}
                  onValueChange={(val) => setNewEvent({ ...newEvent, videoId: val })}
                >
                  <SelectTrigger className="bg-secondary border-border text-foreground">
                    <SelectValue placeholder="Select video" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {readyVideos.map((video) => (
                      <SelectItem key={video.id} value={video.id}>
                        {video.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-foreground">Date</Label>
                <Input
                  type="date"
                  value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                  className="bg-secondary border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Time</Label>
                <Input
                  type="time"
                  value={newEvent.time}
                  onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                  className="bg-secondary border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Repeat</Label>
                <Select
                  value={newEvent.repeat}
                  onValueChange={(val) => setNewEvent({ ...newEvent, repeat: val })}
                >
                  <SelectTrigger className="bg-secondary border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="None">No Repeat</SelectItem>
                    <SelectItem value="Daily">Daily</SelectItem>
                    <SelectItem value="Weekly">Weekly</SelectItem>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Destinations</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {demoDestinations
                  .filter((d) => d.connected)
                  .map((dest) => (
                    <div
                      key={dest.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                        newEvent.destinations.includes(dest.id)
                          ? "border-primary bg-primary/5"
                          : "border-border bg-secondary/50 hover:bg-secondary"
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
              <Button
                onClick={addEvent}
                disabled={!newEvent.title || !newEvent.videoId || !newEvent.date || !newEvent.time}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Schedule
              </Button>
              <Button variant="outline" className="border-border text-foreground" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {events.map((event) => (
          <Card key={event.id} className="border-border bg-card">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10">
                  <Calendar className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{event.title}</p>
                    {event.repeat !== "None" && (
                      <Badge variant="outline" className="gap-1 text-xs text-muted-foreground border-border">
                        <Repeat className="h-3 w-3" />
                        {event.repeat}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Video className="h-3 w-3" />
                      {event.videoName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Radio className="h-3 w-3" />
                      {event.destinations.join(", ")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {event.date} at {event.time}
                  </p>
                  <p className="text-xs text-muted-foreground">{getDaysUntil(event.date)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeEvent(event.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Remove schedule</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
