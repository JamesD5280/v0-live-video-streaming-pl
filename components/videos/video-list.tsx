"use client"

import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Film, MoreVertical, Radio, Trash2, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { fetcher } from "@/lib/fetcher"
import { formatFileSize, formatDuration, type Video } from "@/lib/store"

const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ready: { label: "Ready", className: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle2 },
  uploading: { label: "Uploading", className: "bg-warning/10 text-warning border-warning/20", icon: Loader2 },
  processing: { label: "Processing", className: "bg-chart-2/10 text-chart-2 border-chart-2/20", icon: Loader2 },
  error: { label: "Error", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertCircle },
}

export function VideoList() {
  const { data: videos, error, mutate } = useSWR<Video[]>("/api/videos", fetcher)

  const handleDelete = async (id: string) => {
    await fetch(`/api/videos?id=${id}`, { method: "DELETE" })
    mutate()
  }

  if (error) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 text-sm font-medium text-foreground">Failed to load videos</p>
        <p className="mt-1 text-xs text-muted-foreground">Please try refreshing the page</p>
      </div>
    )
  }

  if (!videos) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <Film className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">No videos yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Upload your first video to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {videos.map((video) => {
        const config = statusConfig[video.status] || statusConfig.ready
        return (
          <Card key={video.id} className="border-border bg-card transition-colors hover:bg-card/80">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-16 w-28 items-center justify-center rounded-lg bg-secondary">
                <Film className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{video.title}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDuration(video.duration_seconds)}</span>
                      <span className="text-border">|</span>
                      <span>{formatFileSize(video.file_size)}</span>
                      {video.resolution && (
                        <>
                          <span className="text-border">|</span>
                          <span>{video.resolution}</span>
                        </>
                      )}
                      {video.format && (
                        <>
                          <span className="text-border">|</span>
                          <span>{video.format}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-xs", config.className)}>
                      {config.label}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Video actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border">
                        <DropdownMenuItem className="gap-2 text-foreground">
                          <Radio className="h-4 w-4" />
                          Stream Now
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 text-destructive" onClick={() => handleDelete(video.id)}>
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Uploaded {new Date(video.created_at).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
