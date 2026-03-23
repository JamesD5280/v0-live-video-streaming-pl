"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Plus,
  Trash2,
  GripVertical,
  ListMusic,
  Music,
  Repeat,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Film,
} from "lucide-react"
import type { Playlist, Video } from "@/lib/store"
import { formatDuration, formatFileSize } from "@/lib/store"

const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json() })

export function PlaylistManager() {
  const { data: playlists, error, mutate } = useSWR<Playlist[]>("/api/playlists", fetcher)
  const { data: videos } = useSWR<Video[]>("/api/videos", fetcher)
  const [creating, setCreating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [loop, setLoop] = useState(true)
  const [selectedVideos, setSelectedVideos] = useState<string[]>([])

  const readyVideos = videos?.filter((v) => v.status === "ready") || []

  const resetForm = () => {
    setName("")
    setDescription("")
    setLoop(true)
    setSelectedVideos([])
    setEditingId(null)
  }

  const openCreateDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (playlist: Playlist) => {
    setEditingId(playlist.id)
    setName(playlist.name)
    setDescription(playlist.description || "")
    setLoop(playlist.loop)
    setSelectedVideos(
      (playlist.playlist_items || [])
        .sort((a, b) => a.position - b.position)
        .map((item) => item.video_id)
    )
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setCreating(true)
    try {
      if (editingId) {
        await fetch("/api/playlists", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, name, description, loop, video_ids: selectedVideos }),
        })
      } else {
        await fetch("/api/playlists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, loop, video_ids: selectedVideos }),
        })
      }
      setDialogOpen(false)
      resetForm()
      mutate()
    } catch {
      // error handled by UI
    }
    setCreating(false)
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/playlists?id=${id}`, { method: "DELETE" })
    mutate()
  }

  const toggleVideo = (videoId: string) => {
    setSelectedVideos((prev) =>
      prev.includes(videoId)
        ? prev.filter((v) => v !== videoId)
        : [...prev, videoId]
    )
  }

  const moveVideo = (index: number, direction: "up" | "down") => {
    const newList = [...selectedVideos]
    const swapIndex = direction === "up" ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= newList.length) return
    ;[newList[index], newList[swapIndex]] = [newList[swapIndex], newList[index]]
    setSelectedVideos(newList)
  }

  const getTotalDuration = (playlist: Playlist) => {
    const items = playlist.playlist_items || []
    return items.reduce((sum, item) => sum + (item.video?.duration_seconds || 0), 0)
  }

  if (error) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="mt-3 text-sm font-medium text-foreground">Failed to load playlists</p>
          <p className="mt-1 text-xs text-muted-foreground">Please try refreshing the page</p>
        </CardContent>
      </Card>
    )
  }

  if (!playlists) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Your Playlists</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create playlists to stream multiple videos in sequence or loop.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" onClick={openCreateDialog}>
              <Plus className="h-3.5 w-3.5" />
              New Playlist
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Playlist" : "Create Playlist"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="playlist-name">Playlist Name</Label>
                <Input
                  id="playlist-name"
                  placeholder="e.g. Friday Night Shows"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="playlist-desc">Description (optional)</Label>
                <Input
                  id="playlist-desc"
                  placeholder="What is this playlist for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Loop Playlist</p>
                    <p className="text-xs text-muted-foreground">Restart from beginning when all videos finish</p>
                  </div>
                </div>
                <Switch checked={loop} onCheckedChange={setLoop} />
              </div>

              <div className="space-y-2">
                <Label>Select Videos ({selectedVideos.length} selected)</Label>
                {readyVideos.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <Film className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">No videos available. Upload videos first.</p>
                  </div>
                ) : (
                  <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                    {readyVideos.map((video) => {
                      const isSelected = selectedVideos.includes(video.id)
                      return (
                        <button
                          key={video.id}
                          type="button"
                          onClick={() => toggleVideo(video.id)}
                          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                            isSelected
                              ? "bg-primary/10 text-primary"
                              : "text-foreground hover:bg-secondary"
                          }`}
                        >
                          <Film className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{video.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(video.duration_seconds)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {selectedVideos.length > 0 && (
                <div className="space-y-2">
                  <Label>Playback Order (drag to reorder)</Label>
                  <div className="space-y-1 rounded-lg border border-border p-2">
                    {selectedVideos.map((vid, index) => {
                      const video = readyVideos.find((v) => v.id === vid)
                      if (!video) return null
                      return (
                        <div
                          key={vid}
                          className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2"
                        >
                          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="flex-1 truncate text-sm text-foreground">
                            {video.title}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => moveVideo(index, "up")}
                              disabled={index === 0}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => moveVideo(index, "down")}
                              disabled={index === selectedVideos.length - 1}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() => toggleVideo(vid)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <Button
                onClick={handleSave}
                disabled={creating || !name.trim() || selectedVideos.length === 0}
                className="w-full"
              >
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? "Save Changes" : "Create Playlist"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {playlists.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <ListMusic className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">No playlists yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create a playlist to stream multiple videos in sequence</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={openCreateDialog}>
              <Plus className="h-3.5 w-3.5" />
              Create Playlist
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {playlists.map((playlist) => {
            const items = playlist.playlist_items || []
            const isExpanded = expandedId === playlist.id
            return (
              <Card key={playlist.id} className="border-border bg-card">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <ListMusic className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold text-foreground">
                          {playlist.name}
                        </CardTitle>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{items.length} video{items.length !== 1 ? "s" : ""}</span>
                          <span>{formatDuration(getTotalDuration(playlist))}</span>
                          {playlist.loop && (
                            <span className="flex items-center gap-1">
                              <Repeat className="h-3 w-3" />
                              Loop
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(isExpanded ? null : playlist.id)}
                        className="text-xs text-muted-foreground"
                      >
                        {isExpanded ? "Collapse" : "Expand"}
                        {isExpanded ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(playlist)}
                        className="text-xs"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(playlist.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && items.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-1 rounded-lg bg-secondary p-2">
                      {items.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-md px-3 py-2"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate text-sm text-foreground">
                            {item.video?.title || "Unknown video"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(item.video?.duration_seconds || null)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(item.video?.file_size || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
