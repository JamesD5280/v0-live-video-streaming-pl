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

type DraftOverlayChange = Partial<
  Pick<Overlay, "position_x" | "position_y" | "size_percent" | "font_size" | "scroll_start_x" | "scroll_end_x">
>

type DraftGesture = {
  pointerId: number
  overlayId: string
  latestChange: DraftOverlayChange
  mode: "move" | "resize"
  type: Overlay["type"]
  startClientX: number
  startClientY: number
  canvasWidth: number
  canvasHeight: number
  initialX: number
  initialY: number
  initialSize: number
  initialFontSize: number
  initialScrollStart: number
  initialScrollEnd: number
  widthPercent: number
  heightPercent: number
}

interface OverlayPreviewProps {
  overlays: Overlay[]
  draftOverlay?: Overlay
  draftVideoPreviewUrl?: string
  compact?: boolean
  editableDraft?: boolean
  selectedOverlayId?: string | null
  onDraftChange?: (change: DraftOverlayChange) => void
  onOverlaySelect?: (overlayId: string) => void
  onOverlayChange?: (overlayId: string, change: DraftOverlayChange) => void
  onOverlayCommit?: (overlayId: string, change: DraftOverlayChange) => void
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

function VideoOverlayPreview({
  name,
  src,
  loop,
}: {
  name: string
  src: string | null
  loop: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src || failed) return

    try {
      void video.play().catch(() => setFailed(true))
    } catch {
      setFailed(true)
    }
  }, [failed, src])

  return (
    <div className="relative w-full overflow-hidden bg-transparent">
      {src && !failed ? (
        <video
          ref={videoRef}
          key={src}
          src={src}
          aria-label={`${name} video overlay preview`}
          className="block h-auto w-full"
          muted
          playsInline
          loop={loop}
          preload="metadata"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/70 text-center">
          <VideoIcon className="h-4 w-4 text-primary" />
          <p className="max-w-full truncate px-2 text-[8px] font-medium text-primary">
            {failed ? "Video preview unavailable" : "Upload video to preview"}
          </p>
        </div>
      )}
    </div>
  )
}

function getOverlayVideoPreviewUrl(
  overlay: Overlay,
  draftOverlay: Overlay | undefined,
  draftVideoPreviewUrl: string | undefined
) {
  if (draftOverlay?.id === overlay.id) {
    if (draftVideoPreviewUrl) return draftVideoPreviewUrl
    if (overlay.id === "draft-overlay") return null
  }

  return `/api/overlays/preview?overlayId=${encodeURIComponent(overlay.id)}`
}

export function OverlayPreview({
  overlays,
  draftOverlay,
  draftVideoPreviewUrl,
  compact = false,
  editableDraft = false,
  selectedOverlayId,
  onDraftChange,
  onOverlaySelect,
  onOverlayChange,
  onOverlayCommit,
}: OverlayPreviewProps) {
  const { data: videos } = useSWR<Video[]>("/api/videos", fetcher)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const overlayElementsRef = useRef(new Map<string, HTMLDivElement>())
  const gestureRef = useRef<DraftGesture | null>(null)
  const [overlayBounds, setOverlayBounds] = useState<Record<string, { widthPercent: number; heightPercent: number }>>({})
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
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === "undefined") return

    const measureOverlays = () => {
      const canvasRect = canvas.getBoundingClientRect()
      if (!canvasRect.width || !canvasRect.height) return

      const nextBounds: Record<string, { widthPercent: number; heightPercent: number }> = {}
      for (const [id, element] of overlayElementsRef.current) {
        if (!element.isConnected) continue
        const rect = element.getBoundingClientRect()
        nextBounds[id] = {
          widthPercent: (rect.width / canvasRect.width) * 100,
          heightPercent: (rect.height / canvasRect.height) * 100,
        }
      }

      setOverlayBounds((current) => {
        const currentIds = Object.keys(current)
        const nextIds = Object.keys(nextBounds)
        if (
          currentIds.length === nextIds.length &&
          nextIds.every((id) => {
            const currentBounds = current[id]
            const next = nextBounds[id]
            return currentBounds && Math.abs(currentBounds.widthPercent - next.widthPercent) < 0.1 &&
              Math.abs(currentBounds.heightPercent - next.heightPercent) < 0.1
          })
        ) return current
        return nextBounds
      })
    }

    const observer = new ResizeObserver(measureOverlays)
    observer.observe(canvas)
    for (const element of overlayElementsRef.current.values()) observer.observe(element)
    measureOverlays()
    return () => observer.disconnect()
  }, [enabledOverlayIds, draftOverlay?.id, draftOverlay?.type, draftOverlay?.size_percent, draftOverlay?.font_size, draftOverlay?.text_content, draftOverlay?.image_path, draftOverlay?.video_path, draftOverlay?.scroll_start_x, draftOverlay?.scroll_end_x])

  const roundPercent = (value: number) => Math.round(value * 10) / 10
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const isDraftEditable = (overlayId: string) => editableDraft && draftOverlay?.id === overlayId && Boolean(onDraftChange)

  const applyOverlayChange = (overlayId: string, change: DraftOverlayChange, commit = false) => {
    if (isDraftEditable(overlayId)) {
      onDraftChange?.(change)
      return
    }
    onOverlayChange?.(overlayId, change)
    if (commit) onOverlayCommit?.(overlayId, change)
  }

  const startDraftGesture = (
    event: React.PointerEvent<HTMLElement>,
    overlay: Overlay,
    mode: DraftGesture["mode"],
  ) => {
    if (event.button !== 0 || (!isDraftEditable(overlay.id) && !onOverlayChange)) return
    const canvas = canvasRef.current
    const element = overlayElementsRef.current.get(overlay.id)
    if (!canvas || !element) return

    const canvasRect = canvas.getBoundingClientRect()
    const overlayRect = element.getBoundingClientRect()
    const tickerStart = clamp(overlay.scroll_start_x ?? 0, 0, 95)
    const tickerEnd = clamp(overlay.scroll_end_x ?? 100, tickerStart + 5, 100)

    gestureRef.current = {
      pointerId: event.pointerId,
      overlayId: overlay.id,
      latestChange: {},
      mode,
      type: overlay.type,
      startClientX: event.clientX,
      startClientY: event.clientY,
      canvasWidth: canvasRect.width,
      canvasHeight: canvasRect.height,
      initialX: overlay.type === "scrolling_text" ? tickerStart : ((overlayRect.left + overlayRect.width / 2 - canvasRect.left) / canvasRect.width) * 100,
      initialY: ((overlayRect.top + overlayRect.height / 2 - canvasRect.top) / canvasRect.height) * 100,
      initialSize: overlay.size_percent || 20,
      initialFontSize: overlay.font_size || 24,
      initialScrollStart: tickerStart,
      initialScrollEnd: tickerEnd,
      widthPercent: (overlayRect.width / canvasRect.width) * 100,
      heightPercent: (overlayRect.height / canvasRect.height) * 100,
    }

    event.preventDefault()
    event.stopPropagation()
    canvas.setPointerCapture(event.pointerId)
  }

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()

    const applyGestureChange = (change: DraftOverlayChange) => {
      gesture.latestChange = { ...gesture.latestChange, ...change }
      applyOverlayChange(gesture.overlayId, change)
    }
    const deltaX = ((event.clientX - gesture.startClientX) / gesture.canvasWidth) * 100
    const deltaY = ((event.clientY - gesture.startClientY) / gesture.canvasHeight) * 100

    if (gesture.mode === "resize") {
      if (gesture.type === "scrolling_text") {
        applyGestureChange({ scroll_end_x: roundPercent(clamp(gesture.initialScrollEnd + deltaX, gesture.initialScrollStart + 5, 100)) })
      } else if (gesture.type === "text" || gesture.type === "lower_third") {
        applyGestureChange({ font_size: Math.round(clamp(gesture.initialFontSize + deltaX * 19.2, 12, 120)) })
      } else {
        applyGestureChange({ size_percent: Math.round(clamp(gesture.initialSize + deltaX, 5, 100)) })
      }
      return
    }

    if (gesture.type === "scrolling_text") {
      const zoneWidth = gesture.initialScrollEnd - gesture.initialScrollStart
      const start = clamp(gesture.initialScrollStart + deltaX, 0, 100 - zoneWidth)
      const fontSize = clamp(gesture.initialFontSize, 12, 120)
      const minY = (fontSize / 1080) * 100
      const maxY = ((1080 - fontSize - 10) / 1080) * 100
      applyGestureChange({
        scroll_start_x: roundPercent(start),
        scroll_end_x: roundPercent(start + zoneWidth),
        position_y: roundPercent(clamp(gesture.initialY + deltaY, minY, maxY)),
      })
      return
    }

    const halfWidth = gesture.widthPercent / 2
    const halfHeight = gesture.heightPercent / 2
    const x = gesture.type === "lower_third"
      ? undefined
      : roundPercent(clamp(gesture.initialX + deltaX, halfWidth, 100 - halfWidth))
    const y = roundPercent(clamp(gesture.initialY + deltaY, halfHeight, 100 - halfHeight))
    applyGestureChange({ ...(x === undefined ? {} : { position_x: x }), position_y: y })
  }

  const endDraftGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (gesture?.pointerId !== event.pointerId) return
    gestureRef.current = null
    if (Object.keys(gesture.latestChange).length > 0 && !isDraftEditable(gesture.overlayId)) {
      onOverlayCommit?.(gesture.overlayId, gesture.latestChange)
    }
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }

  const handleDraftKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, overlay: Overlay) => {
    if (!isDraftEditable(overlay.id) && !onOverlayChange) return
    const step = event.shiftKey ? 2 : 0.5
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return
    event.preventDefault()
    onOverlaySelect?.(overlay.id)

    const canvas = canvasRef.current
    const element = overlayElementsRef.current.get(overlay.id)
    if (!canvas || !element) return
    const canvasRect = canvas.getBoundingClientRect()
    const overlayRect = element.getBoundingClientRect()
    const y = ((overlayRect.top + overlayRect.height / 2 - canvasRect.top) / canvasRect.height) * 100

    if (overlay.type === "scrolling_text") {
      const start = clamp(overlay.scroll_start_x ?? 0, 0, 95)
      const end = clamp(overlay.scroll_end_x ?? 100, start + 5, 100)
      const delta = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0
      const nextStart = clamp(start + delta, 0, 100 - (end - start))
      const fontSize = clamp(overlay.font_size || 24, 12, 120)
      const nextY = event.key === "ArrowUp" || event.key === "ArrowDown"
        ? clamp(y + (event.key === "ArrowUp" ? -step : step), (fontSize / 1080) * 100, ((1080 - fontSize - 10) / 1080) * 100)
        : y
      applyOverlayChange(overlay.id, {
        scroll_start_x: roundPercent(nextStart),
        scroll_end_x: roundPercent(nextStart + end - start),
        position_y: roundPercent(nextY),
      }, true)
      return
    }

    const x = ((overlayRect.left + overlayRect.width / 2 - canvasRect.left) / canvasRect.width) * 100
    const bounds = overlayBounds[overlay.id]
    const widthHalf = (bounds?.widthPercent ?? 0) / 2
    const heightHalf = (bounds?.heightPercent ?? 0) / 2
    const nextX = overlay.type === "lower_third" || event.key === "ArrowUp" || event.key === "ArrowDown"
      ? undefined
      : roundPercent(clamp(x + (event.key === "ArrowLeft" ? -step : step), widthHalf, 100 - widthHalf))
    const nextY = event.key === "ArrowLeft" || event.key === "ArrowRight"
      ? y
      : roundPercent(clamp(y + (event.key === "ArrowUp" ? -step : step), heightHalf, 100 - heightHalf))
    applyOverlayChange(overlay.id, { ...(nextX === undefined ? {} : { position_x: nextX }), position_y: nextY }, true)
  }

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, overlay: Overlay) => {
    if ((!isDraftEditable(overlay.id) && !onOverlayChange) || !["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    onOverlaySelect?.(overlay.id)
    const step = event.shiftKey ? 5 : 1
    const direction = event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1
    if (overlay.type === "scrolling_text") {
      const start = clamp(overlay.scroll_start_x ?? 0, 0, 95)
      const end = clamp(overlay.scroll_end_x ?? 100, start + 5, 100)
      applyOverlayChange(overlay.id, { scroll_end_x: roundPercent(clamp(end + direction * step, start + 5, 100)) }, true)
    } else if (overlay.type === "text" || overlay.type === "lower_third") {
      applyOverlayChange(overlay.id, { font_size: Math.round(clamp((overlay.font_size || 24) + direction * step, 12, 120)) }, true)
    } else {
      applyOverlayChange(overlay.id, { size_percent: Math.round(clamp((overlay.size_percent || 20) + direction * step, 5, 100)) }, true)
    }
  }

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

  if (enabledOverlays.length === 0 && !onOverlayChange && !editableDraft) return null

  return (
    <div className="w-full space-y-3">
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
      <div
        ref={canvasRef}
        className="relative w-full touch-none overflow-hidden rounded-lg border border-border bg-black"
        style={{ paddingBottom: "56.25%", containerType: "inline-size" }}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={endDraftGesture}
        onPointerCancel={endDraftGesture}
        onLostPointerCapture={() => { gestureRef.current = null }}
      >
        {/* Background: real video or simulated pattern */}
        <div className="absolute inset-0">
          {selectedVideo ? (
            <>
              <video
                ref={videoRef}
                src={proxyVideoUrl || undefined}
                className="absolute inset-0 h-full w-full bg-black object-contain"
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
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <p className="text-center text-xs font-medium text-muted-foreground">
                Select a background clip to preview the stream output
              </p>
            </div>
          )}
        </div>

        {/* Render each visible overlay */}
        {enabledOverlays.map((overlay) => {
          const isVisible = visibleIds.has(overlay.id)
          const isDraftEditable = editableDraft && draftOverlay?.id === overlay.id && Boolean(onDraftChange)
          const isEditable = isDraftEditable || Boolean(onOverlayChange)
          const isSelected = selectedOverlayId === overlay.id || isDraftEditable
          const isHighlighted = highlightedId === overlay.id || isSelected
          if (!isVisible) return null

          const isTicker = overlay.type === "scrolling_text"
          const isTextOverlay = overlay.type === "text" || overlay.type === "lower_third"
          const isLowerThird = overlay.type === "lower_third"
          const tickerStart = clamp(overlay.scroll_start_x ?? 0, 0, 95)
          const tickerEnd = Math.max(tickerStart + 5, Math.min(100, overlay.scroll_end_x ?? 100))
          const tickerWidth = tickerEnd - tickerStart
          const tickerSpeed = Math.max(1, overlay.scroll_speed ?? 20)
          const fontSize = clamp(overlay.font_size || 24, 12, 120)
          const estimatedTextWidth = (overlay.text_content?.length || 0) * fontSize * 0.58
          const tickerDuration = (1920 * (tickerWidth / 100) + estimatedTextWidth) / tickerSpeed
          const tickerCenterY = clamp(overlay.position_y ?? 92, (fontSize / 1080) * 100, ((1080 - fontSize - 10) / 1080) * 100)
          const positionStyle = isTicker
            ? {
                left: `${tickerStart}%`,
                top: `${tickerCenterY}%`,
                transform: "translateY(-50%)",
              }
            : isLowerThird
              ? {
                  left: "0%",
                  top: `${overlay.position_y ?? 50}%`,
                  transform: "translateY(-50%)",
                }
              : getPositionStyle(overlay)
          const opacityValue = overlay.opacity / 100
          const sizePercent = overlay.size_percent || 20
          const fontStyle = getFontStyle(overlay)
          const measuredBounds = overlayBounds[overlay.id]
          const overlayWidth = isTicker
            ? `${tickerWidth}%`
            : isLowerThird
              ? "100%"
              : isTextOverlay
                ? "max-content"
                : `${sizePercent}%`
          const overlayStyle: React.CSSProperties = {
            ...positionStyle,
            opacity: opacityValue,
            zIndex: isHighlighted ? 10 : 1,
            width: overlayWidth,
            ...(isTicker ? { height: `${(fontSize + 16) * 100 / 1920}cqw` } : {}),
          }

          if (!isTicker && !isTextOverlay && measuredBounds) {
            const x = overlay.position_x ?? 50
            const y = overlay.position_y ?? 50
            overlayStyle.left = `${Math.max(0, Math.min(100 - measuredBounds.widthPercent, x - measuredBounds.widthPercent / 2))}%`
            overlayStyle.top = `${Math.max(0, Math.min(100 - measuredBounds.heightPercent, y - measuredBounds.heightPercent / 2))}%`
            overlayStyle.transform = "none"
          }

          return (
            <div
              key={overlay.id}
              ref={(node) => {
                if (node) overlayElementsRef.current.set(overlay.id, node)
                else overlayElementsRef.current.delete(overlay.id)
              }}
              data-overlay-box="true"
              role={isEditable ? "group" : undefined}
              tabIndex={isEditable ? 0 : undefined}
              aria-label={isEditable
                ? overlay.type === "lower_third"
                  ? `Select and move ${overlay.name} vertically; resize its text with the corner handle`
                  : `Select and move ${overlay.name}; use the corner handle to resize`
                : undefined}
              className={cn(
                "absolute",
                isEditable ? "cursor-move touch-none transition-none" : "transition-all duration-300",
                isHighlighted && "rounded ring-2 ring-primary ring-offset-1 ring-offset-transparent"
              )}
              style={overlayStyle}
              onPointerDown={isEditable ? (event) => {
                onOverlaySelect?.(overlay.id)
                startDraftGesture(event, overlay, "move")
              } : undefined}
              onFocus={isEditable ? () => onOverlaySelect?.(overlay.id) : undefined}
              onKeyDown={isEditable ? (event) => handleDraftKeyDown(event, overlay) : undefined}
              onMouseEnter={() => setHighlightedId(overlay.id)}
              onMouseLeave={() => setHighlightedId(null)}
            >
              {/* Image overlay -- inherits width from parent which is % of canvas */}
              {overlay.image_path && overlay.type !== "video" && overlay.type !== "text" && overlay.type !== "lower_third" && overlay.type !== "scrolling_text" && (
                <img
                  src={overlay.image_path}
                  alt={overlay.name}
                  className="block h-auto w-full"
                  crossOrigin="anonymous"
                />
              )}

              {!overlay.image_path && ["logo", "bug", "image"].includes(overlay.type) && (
                <div className="flex min-h-8 w-full items-center justify-center rounded border border-dashed border-primary/50 bg-background/80 px-2 text-center text-[10px] font-medium text-foreground">
                  {overlay.name || "Image overlay"}
                </div>
              )}

              {overlay.type === "video" && (
                <VideoOverlayPreview
                  name={overlay.name}
                  src={getOverlayVideoPreviewUrl(overlay, draftOverlay, draftVideoPreviewUrl)}
                  loop={overlay.loop_overlay !== false}
                />
              )}

              {/* Text overlay */}
              {(overlay.type === "text" || overlay.type === "lower_third") && overlay.text_content && (
                <div
                  className={cn("whitespace-nowrap leading-none", isLowerThird && "flex w-full items-center")}
                  style={{
                    ...fontStyle,
                    color: overlay.font_color,
                    fontSize: `${fontSize * 100 / 1920}cqw`,
                    lineHeight: 1,
                    ...(isLowerThird
                      ? {
                          backgroundColor: overlay.bg_color,
                          height: `${(fontSize + 30) * 100 / 1920}cqw`,
                          paddingLeft: `${20 * 100 / 1920}cqw`,
                        }
                      : {}),
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
                    className="absolute left-0 top-1/2 inline-block -translate-y-1/2 whitespace-nowrap"
                    style={{
                      ...fontStyle,
                      color: overlay.font_color,
                      fontSize: `${fontSize * 100 / 1920}cqw`,
                      lineHeight: 1,
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

              {isEditable && (isDraftEditable || selectedOverlayId === overlay.id) && (
                <button
                  type="button"
                  aria-label={`Resize ${overlay.name}`}
                  aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                  title="Drag to resize; use arrow keys for precise changes"
                  className="absolute bottom-0 right-0 z-20 grid size-4 translate-x-1/2 translate-y-1/2 touch-none cursor-se-resize place-items-center rounded border border-background bg-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onOverlaySelect?.(overlay.id)
                    startDraftGesture(event, overlay, "resize")
                  }}
                  onKeyDown={(event) => handleResizeKeyDown(event, overlay)}
                  onClick={(event) => event.stopPropagation()}
                >
                  <span aria-hidden="true" className="size-1 rounded-sm bg-primary-foreground" />
                </button>
              )}
            </div>
          )
        })}

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
