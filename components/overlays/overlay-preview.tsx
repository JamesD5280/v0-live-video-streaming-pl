"use client"

import { useState, useRef, useEffect } from "react"
import useSWR from "swr"
import type { Overlay, OverlayPosition, Video } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Eye, EyeOff, Video as VideoIcon, Type, Film, Play, Pause, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json() })

interface OverlayPreviewProps {
  overlays: Overlay[]
}

function getPositionStyle(position: OverlayPosition): React.CSSProperties {
  const styles: Record<OverlayPosition, React.CSSProperties> = {
    "top-left": { top: "4%", left: "3%" },
    "top-center": { top: "4%", left: "50%", transform: "translateX(-50%)" },
    "top-right": { top: "4%", right: "3%" },
    "center": { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
    "bottom-left": { bottom: "4%", left: "3%" },
    "bottom-center": { bottom: "4%", left: "50%", transform: "translateX(-50%)" },
    "bottom-right": { bottom: "4%", right: "3%" },
  }
  return styles[position] || styles["top-left"]
}

export function OverlayPreview({ overlays }: OverlayPreviewProps) {
  const { data: videos } = useSWR<Video[]>("/api/videos", fetcher)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    new Set(overlays.filter((o) => o.enabled).map((o) => o.id))
  )
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [directVideoUrl, setDirectVideoUrl] = useState("")

  // Update visible IDs when overlays change
  useEffect(() => {
    setVisibleIds(new Set(overlays.filter((o) => o.enabled).map((o) => o.id)))
  }, [overlays])

  // Fetch signed direct URL when video is selected
  useEffect(() => {
    if (!selectedVideo) {
      setDirectVideoUrl("")
      return
    }
    fetch(`/api/videos/preview?filename=${encodeURIComponent(selectedVideo.filename)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.url) setDirectVideoUrl(data.url)
      })
      .catch(() => {})
  }, [selectedVideo])

  const toggleVisibility = (id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handlePlayPause = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play()
      setIsPlaying(true)
    } else {
      videoRef.current.pause()
      setIsPlaying(false)
    }
  }

  const enabledOverlays = overlays.filter((o) => o.enabled)
  const readyVideos = (videos || []).filter((v) => v.status === "ready")

  if (enabledOverlays.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Overlay Preview</h3>
        <div className="flex items-center gap-2">
          {/* Video selector for background */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
                <Film className="h-3 w-3" />
                {selectedVideo ? selectedVideo.title : "Select video background"}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-60 overflow-y-auto bg-card border-border">
              <DropdownMenuItem
                className="text-xs text-foreground"
                onClick={() => { setSelectedVideo(null); setIsPlaying(false) }}
              >
                No video (pattern background)
              </DropdownMenuItem>
              {readyVideos.map((video) => (
                <DropdownMenuItem
                  key={video.id}
                  className="text-xs text-foreground"
                  onClick={() => { setSelectedVideo(video); setIsPlaying(false) }}
                >
                  {video.title}
                </DropdownMenuItem>
              ))}
              {readyVideos.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No videos uploaded yet</p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 16:9 preview canvas */}
      <div className="relative w-full overflow-hidden rounded-lg border border-border bg-[#1a1a2e]" style={{ paddingBottom: "56.25%" }}>
        {/* Background: real video or simulated pattern */}
        <div className="absolute inset-0">
          {selectedVideo ? (
            <>
              <video
                ref={videoRef}
                src={directVideoUrl || undefined}
                className="absolute inset-0 h-full w-full object-cover"
                loop
                muted
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              {/* Play/Pause control */}
              <button
                type="button"
                onClick={handlePlayPause}
                className="absolute bottom-2 left-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80"
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5 ml-0.5" />
                )}
              </button>
              {/* Video label */}
              <div className="absolute bottom-2 right-2 z-20 rounded bg-black/60 px-2 py-0.5">
                <p className="text-[10px] font-medium text-white/80 truncate max-w-[200px]">
                  {selectedVideo.title}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-gradient-to-br from-[#16213e] to-[#0f3460]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-20">
                <div className="h-px w-4/5 bg-white/30" />
                <div className="h-px w-3/5 bg-white/20" />
                <div className="h-px w-4/5 bg-white/30" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <VideoIcon className="h-5 w-5 text-white/20" />
                  </div>
                  <p className="text-xs font-medium text-white/15">Select a video above to preview</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Render each visible overlay */}
        {enabledOverlays.map((overlay) => {
          const isVisible = visibleIds.has(overlay.id)
          const isHighlighted = highlightedId === overlay.id
          if (!isVisible) return null

          const positionStyle = getPositionStyle(overlay.position)
          const opacityValue = overlay.opacity / 100
          const sizePercent = overlay.size_percent

          return (
            <div
              key={overlay.id}
              className={cn(
                "absolute transition-all duration-300",
                isHighlighted && "ring-2 ring-primary ring-offset-1 ring-offset-transparent rounded"
              )}
              style={{
                ...positionStyle,
                opacity: opacityValue,
                zIndex: isHighlighted ? 10 : 1,
              }}
              onMouseEnter={() => setHighlightedId(overlay.id)}
              onMouseLeave={() => setHighlightedId(null)}
            >
              {/* Image overlay */}
              {overlay.image_path && overlay.type !== "video" && overlay.type !== "text" && overlay.type !== "lower_third" && (
                <img
                  src={overlay.image_path}
                  alt={overlay.name}
                  className="object-contain"
                  style={{
                    width: `${sizePercent * 3}px`,
                    maxWidth: `${sizePercent}vw`,
                  }}
                  crossOrigin="anonymous"
                />
              )}

              {/* Video overlay placeholder */}
              {overlay.type === "video" && (
                <div
                  className="flex items-center justify-center rounded border border-primary/30 bg-primary/10 backdrop-blur-sm"
                  style={{
                    width: `${sizePercent * 3}px`,
                    height: `${sizePercent * 3}px`,
                    maxWidth: `${sizePercent}vw`,
                    maxHeight: `${sizePercent}vw`,
                  }}
                >
                  <div className="text-center">
                    <VideoIcon className="mx-auto h-4 w-4 text-primary" />
                    <p className="mt-0.5 text-[8px] font-medium text-primary">{overlay.name}</p>
                  </div>
                </div>
              )}

              {/* Text overlay */}
              {(overlay.type === "text" || overlay.type === "lower_third") && overlay.text_content && (
                <div
                  className={cn(
                    "whitespace-nowrap px-3 py-1.5",
                    overlay.type === "lower_third" && "rounded"
                  )}
                  style={{
                    backgroundColor: overlay.bg_color,
                    color: overlay.font_color,
                    fontSize: `${Math.max(10, overlay.font_size * 0.5)}px`,
                  }}
                >
                  {overlay.text_content}
                </div>
              )}

              {/* Name tooltip on hover */}
              {isHighlighted && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                  {overlay.name}
                </div>
              )}
            </div>
          )
        })}

        {/* Safe zone guides */}
        <div className="pointer-events-none absolute inset-[5%] border border-dashed border-white/5 rounded" />
      </div>

      {/* Toggle controls for each overlay */}
      <div className="flex flex-wrap gap-2">
        {enabledOverlays.map((overlay) => {
          const isVisible = visibleIds.has(overlay.id)
          const isHighlighted = highlightedId === overlay.id
          return (
            <button
              key={overlay.id}
              type="button"
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                isVisible
                  ? isHighlighted
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-foreground"
                  : "border-border bg-secondary/30 text-muted-foreground line-through"
              )}
              onClick={() => toggleVisibility(overlay.id)}
              onMouseEnter={() => setHighlightedId(overlay.id)}
              onMouseLeave={() => setHighlightedId(null)}
            >
              {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {overlay.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
