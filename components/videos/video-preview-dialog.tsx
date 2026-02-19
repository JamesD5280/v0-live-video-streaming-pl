"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Video } from "@/lib/store"

interface VideoPreviewDialogProps {
  video: Video | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return "0:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function VideoPreviewDialog({ video, open, onOpenChange }: VideoPreviewDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showControls, setShowControls] = useState(true)
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null)

  // Build the proxy URL - the Edge Runtime proxy handles HTTPS -> HTTP
  const videoUrl = video ? `/api/videos/preview?filename=${encodeURIComponent(video.filename)}` : ""

  // Reset state when video changes
  useEffect(() => {
    if (open && video) {
      setPlaying(false)
      setCurrentTime(0)
      setDuration(0)
      setLoading(true)
      setError(null)
      setShowControls(true)
    }
  }, [open, video])

  // Clean up on close
  useEffect(() => {
    if (!open && videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
      setPlaying(false)
    }
  }, [open])

  const togglePlay = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) {
      el.play()
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }, [])

  const skip = useCallback((seconds: number) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + seconds))
  }, [])

  const handleSeek = useCallback((value: number[]) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = value[0]
    setCurrentTime(value[0])
  }, [])

  const handleVolumeChange = useCallback((value: number[]) => {
    const el = videoRef.current
    if (!el) return
    el.volume = value[0]
    setVolume(value[0])
    if (value[0] === 0) setMuted(true)
    else setMuted(false)
  }, [])

  const toggleMute = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    el.muted = !el.muted
    setMuted(el.muted)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      el.requestFullscreen()
    }
  }, [])

  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    if (playing) {
      hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [playing])

  useEffect(() => {
    if (playing) {
      hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000)
    } else {
      setShowControls(true)
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    }
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    }
  }, [playing])

  if (!video) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-border bg-card p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-foreground truncate pr-8">{video.title}</DialogTitle>
        </DialogHeader>

        <div
          ref={containerRef}
          className="relative bg-black cursor-pointer"
          onMouseMove={resetHideTimer}
          onClick={togglePlay}
        >
          {/* Video element */}
          <video
            ref={videoRef}
            src={videoUrl}
            className="mx-auto max-h-[70vh] w-full"
            preload="metadata"
            playsInline
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration)
              setLoading(false)
            }}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onWaiting={() => setLoading(true)}
            onCanPlay={() => setLoading(false)}
            onError={() => {
              setLoading(false)
              setError("Unable to play this video. The file may not be in a browser-compatible format.")
            }}
          />

          {/* Loading overlay */}
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-10 w-10 animate-spin text-white" />
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 px-8">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="text-center text-sm text-white">{error}</p>
            </div>
          )}

          {/* Play/Pause big button overlay */}
          {!playing && !loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 transition-transform hover:scale-110">
                <Play className="h-8 w-8 text-white ml-1" />
              </div>
            </div>
          )}

          {/* Controls bar */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8 transition-opacity duration-300",
              showControls ? "opacity-100" : "opacity-0"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Progress bar */}
            <Slider
              value={[currentTime]}
              min={0}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="mb-3 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-white [&_.relative]:h-1 [&_.absolute]:bg-primary"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => skip(-10)}
                >
                  <SkipBack className="h-4 w-4" />
                  <span className="sr-only">Skip back 10 seconds</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20 hover:text-white"
                  onClick={togglePlay}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  <span className="sr-only">{playing ? "Pause" : "Play"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => skip(10)}
                >
                  <SkipForward className="h-4 w-4" />
                  <span className="sr-only">Skip forward 10 seconds</span>
                </Button>

                <span className="ml-2 text-xs font-mono text-white/80">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20 hover:text-white"
                  onClick={toggleMute}
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  <span className="sr-only">{muted ? "Unmute" : "Mute"}</span>
                </Button>
                <Slider
                  value={[muted ? 0 : volume]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={handleVolumeChange}
                  className="w-20 [&_[role=slider]]:h-2.5 [&_[role=slider]]:w-2.5 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-white [&_.relative]:h-1 [&_.absolute]:bg-white/80"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20 hover:text-white"
                  onClick={toggleFullscreen}
                >
                  <Maximize className="h-4 w-4" />
                  <span className="sr-only">Fullscreen</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Video info bar */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {video.format && <span>{video.format}</span>}
            {video.resolution && <span>{video.resolution}</span>}
            <span>{(video.file_size / (1024 * 1024)).toFixed(0)} MB</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Uploaded {new Date(video.created_at).toLocaleDateString()}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
