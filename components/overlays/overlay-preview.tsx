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
  draftOverlay?: Overlay
  compact?: boolean
}

function getFontStyle(overlay: Overlay): React.CSSProperties {
  const family = overlay.font_family || "sans"
  const familyMap: Record<string, string> = {
    viga: "Viga, sans-serif",
    sans: "DejaVu Sans, sans-serif",
    serif: "DejaVu Serif, serif",
    mono: "DejaVu Sans Mono, monospace",
    arial: "Arial, sans-serif",
    times: "Times New Roman, serif",
    courier: "Courier New, monospace",
  }
  const weight = overlay.font_weight || "normal"

  return {
    fontFamily: familyMap[family] || familyMap.sans,
    fontWeight: weight.includes("bold") ? 700 : 400,
    fontStyle: weight.includes("italic") ? "italic" : "normal",
  }
}

function getPositionStyle(overlay: Overlay): React.CSSProperties {
  // Use X/Y percentage positioning if available
  if (overlay.position_x !== undefined && overlay.position_y !== undefined) {
    return {
      left: `${overlay.position_x}%`,
      top: `${overlay.position_y}%`,
      transform: "translate(-50%, -50%)",
    }
  }
  // Legacy fallback
  const styles: Record<OverlayPosition, React.CSSProperties> = {
    "top-left": { top: "4%", left: "3%" },
    "top-center": { top: "4%", left: "50%", transform: "translateX(-50%)" },
    "top-right": { top: "4%", right: "3%" },
    "center": { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
    "bottom-left": { bottom: "4%", left: "3%" },
    "bottom-center": { bottom: "4%", left: "50%", transform: "translateX(-50%)" },
    "bottom-right": { bottom: "4%", right: "3%" },
  }
  return styles[overlay.position] || styles["top-left"]
}

export function OverlayPreview({ overlays, draftOverlay, compact = false }: OverlayPreviewProps) {
  const { data: videos } = useSWR<Video[]>("/api/videos", fetcher)
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewOverlays = draftOverlay
    ? [...overlays.filter((overlay) => overlay.id !== draftOverlay.id), draftOverlay]
    : overlays
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [tickerPaused, setTickerPaused] = useState(false)
  const enabledOverlays = previewOverlays.filter((overlay) => overlay.enabled)
  const enabledOverlayIds = enabledOverlays.map((overlay) => overlay.id).join("\u0000")
  const scrollingOverlays = enabledOverlays.filter((overlay) => overlay.type === "scrolling_text")

  useEffect(() => {
    setVisibleIds(new Set(enabledOverlayIds ? enabledOverlayIds.split("\u0000") : []))
  }, [enabledOverlayIds])

  const proxyVideoUrl = selectedVideo
    ? `/api/videos/preview?videoId=${encodeURIComponent(selectedVideo.id)}`
    : ""

  const toggleVisibility = (id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    const video = videoRef.current
    setVideoError(null)
    setIsPlaying(false)
    if (!video || !proxyVideoUrl) return

    video.load()
    video.muted = true
    void video.play().catch(() => setIsPlaying(false))

    return () => video.pause()
  }, [proxyVideoUrl])

  const handlePlayPause = async () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      setVideoError(null)
      try {
        await video.play()
      } catch {
        setIsPlaying(false)
        setVideoError("This video could not be played. Use an MP4 encoded with H.264 video and AAC audio.")
      }
    } else {
      video.pause()
    }
  }

  const readyVideos = (videos || []).filter((video) => video.status === "ready")

  if (enabledOverlays.length === 0) return null

  return (
    <div className={cn("space-y-3", compact && "max-w-xl")}>
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
      <div className="relative w-full overflow-hidden rounded-lg border border-border bg-foreground" style={{ paddingBottom: "56.25%" }}>
        {/* Background: real video or simulated pattern */}
        <div className="absolute inset-0">
          {selectedVideo ? (
            <>
              <video
                ref={videoRef}
                src={proxyVideoUrl || undefined}
                className="absolute inset-0 h-full w-full object-cover"
                loop
                muted
                playsInline
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => {
                  setIsPlaying(false)
                  setVideoError("This video could not be played. Use an MP4 encoded with H.264 video and AAC audio.")
                }}
              />
              {videoError && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/75 p-4">
                  <p role="alert" className="max-w-sm text-center text-xs font-medium text-white">
                    {videoError}
                  </p>
                </div>
              )}
              {/* Play/Pause control */}
              <button
                type="button"
                onClick={handlePlayPause}
                aria-label={isPlaying ? "Pause background video" : "Play background video"}
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

          const isTicker = overlay.type === "scrolling_text"
          const tickerStart = Math.max(0, Math.min(95, overlay.scroll_start_x ?? 0))
          const tickerEnd = Math.max(tickerStart + 5, Math.min(100, overlay.scroll_end_x ?? 100))
          const tickerWidth = tickerEnd - tickerStart
          const tickerSpeed = Math.max(1, overlay.scroll_speed ?? 20)
          const tickerFontSize = Math.max(12, overlay.font_size || 24)
          const estimatedTextWidth = (overlay.text_content?.length || 0) * tickerFontSize * 0.58
          const tickerDuration = (1920 * (tickerWidth / 100) + estimatedTextWidth) / tickerSpeed
          const positionStyle = isTicker
            ? {
                left: `${tickerStart}%`,
                top: `${overlay.position_y ?? 92}%`,
                transform: "translateY(-50%)",
                containerType: "inline-size" as const,
              }
            : getPositionStyle(overlay)
          const opacityValue = overlay.opacity / 100
          const sizePercent = overlay.size_percent
          const fontStyle = getFontStyle(overlay)

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
                width: `${isTicker ? tickerWidth : Math.max(5, sizePercent)}%`,
                ...(isTicker ? { height: `${Math.max(18, tickerFontSize * 0.62)}px` } : {}),
              }}
              onMouseEnter={() => setHighlightedId(overlay.id)}
              onMouseLeave={() => setHighlightedId(null)}
            >
              {/* Image overlay -- inherits width from parent which is % of canvas */}
              {overlay.image_path && overlay.type !== "video" && overlay.type !== "text" && overlay.type !== "lower_third" && overlay.type !== "scrolling_text" && (
                <img
                  src={overlay.image_path}
                  alt={overlay.name}
                  className="w-full object-contain"
                  crossOrigin="anonymous"
                />
              )}

              {!overlay.image_path && ["logo", "bug", "image"].includes(overlay.type) && (
                <div className="flex min-h-8 w-full items-center justify-center rounded border border-dashed border-primary/50 bg-background/80 px-2 text-center text-[10px] font-medium text-foreground">
                  {overlay.name || "Image overlay"}
                </div>
              )}

              {/* Video overlay placeholder */}
              {overlay.type === "video" && (
                <div
                  className="flex w-full items-center justify-center rounded border border-primary/30 bg-primary/10 backdrop-blur-sm"
                  style={{
                    aspectRatio: "16/9",
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
                    ...fontStyle,
                    backgroundColor: overlay.bg_color,
                    color: overlay.font_color,
                    fontSize: `clamp(8px, ${overlay.font_size * 100 / 1920}vw, ${overlay.font_size}px)`,
                  }}
                >
                  {overlay.text_content}
                </div>
              )}

              {/* Scrolling text overlay */}
              {isTicker && overlay.text_content && (
                <div
                  className="relative h-full w-full overflow-hidden rounded-sm"
                  style={{ backgroundColor: overlay.bg_color }}
                >
                  <span
                    className="absolute left-0 top-1/2 inline-block whitespace-nowrap"
                    style={{
                      ...fontStyle,
                      color: overlay.font_color,
                      fontSize: `clamp(8px, ${tickerFontSize * 100 / 1920}vw, ${tickerFontSize}px)`,
                      animation: `scrollText ${Math.max(1, tickerDuration)}s linear infinite`,
                      animationPlayState: tickerPaused ? "paused" : "running",
                    }}
                  >
                    {overlay.text_content}
                  </span>
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

      {scrollingOverlays.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={tickerPaused}
          onClick={() => setTickerPaused((paused) => !paused)}
          className="gap-2"
        >
          {tickerPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {tickerPaused ? "Resume ticker" : "Pause ticker"}
        </Button>
      )}

      {!compact && (
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
      )}
    </div>
  )
}
