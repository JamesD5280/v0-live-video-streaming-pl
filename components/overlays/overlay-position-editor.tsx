"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Crosshair,
  Grid3X3,
  AlignStartVertical,
  AlignEndVertical,
  AlignCenterVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignCenterHorizontal,
} from "lucide-react"

// Safe zone percentages (standard broadcast)
const SAFE_ZONES = {
  action: 3.5,   // Action safe: 3.5% from each edge
  title: 10,     // Title safe: 10% from each edge
}

// Snap-to-grid presets (percentage positions)
const SNAP_PRESETS = [
  { label: "TL", x: 5, y: 5 },
  { label: "TC", x: 50, y: 5 },
  { label: "TR", x: 95, y: 5 },
  { label: "CL", x: 5, y: 50 },
  { label: "C", x: 50, y: 50 },
  { label: "CR", x: 95, y: 50 },
  { label: "BL", x: 5, y: 95 },
  { label: "BC", x: 50, y: 95 },
  { label: "BR", x: 95, y: 95 },
]

interface OverlayPositionEditorProps {
  positionX: number
  positionY: number
  onPositionChange: (x: number, y: number) => void
  overlayType?: string
  overlayName?: string
  imagePath?: string | null
  textContent?: string | null
  sizePercent?: number
}

export function OverlayPositionEditor({
  positionX,
  positionY,
  onPositionChange,
  overlayType = "image",
  overlayName = "Overlay",
  imagePath,
  textContent,
  sizePercent = 15,
}: OverlayPositionEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showSafeZones, setShowSafeZones] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [localX, setLocalX] = useState(positionX)
  const [localY, setLocalY] = useState(positionY)

  useEffect(() => {
    setLocalX(positionX)
    setLocalY(positionY)
  }, [positionX, positionY])

  const clamp = (val: number, min = 0, max = 100) => Math.max(min, Math.min(max, val))

  const getPercentFromMouse = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current) return { x: localX, y: localY }
      const rect = canvasRef.current.getBoundingClientRect()
      const x = clamp(((clientX - rect.left) / rect.width) * 100)
      const y = clamp(((clientY - rect.top) / rect.height) * 100)
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
    },
    [localX, localY]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      const { x, y } = getPercentFromMouse(e.clientX, e.clientY)
      setLocalX(x)
      setLocalY(y)
      onPositionChange(x, y)
    },
    [getPercentFromMouse, onPositionChange]
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return
      const { x, y } = getPercentFromMouse(e.clientX, e.clientY)
      setLocalX(x)
      setLocalY(y)
      onPositionChange(x, y)
    },
    [isDragging, getPercentFromMouse, onPositionChange]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Touch support
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault()
      setIsDragging(true)
      const touch = e.touches[0]
      const { x, y } = getPercentFromMouse(touch.clientX, touch.clientY)
      setLocalX(x)
      setLocalY(y)
      onPositionChange(x, y)
    },
    [getPercentFromMouse, onPositionChange]
  )

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging) return
      const touch = e.touches[0]
      const { x, y } = getPercentFromMouse(touch.clientX, touch.clientY)
      setLocalX(x)
      setLocalY(y)
      onPositionChange(x, y)
    },
    [isDragging, getPercentFromMouse, onPositionChange]
  )

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("touchmove", handleTouchMove, { passive: false })
      window.addEventListener("touchend", handleMouseUp)
      return () => {
        window.removeEventListener("touchmove", handleTouchMove)
        window.removeEventListener("touchend", handleMouseUp)
      }
    }
  }, [isDragging, handleTouchMove, handleMouseUp])

  const handleXInput = (val: string) => {
    const num = clamp(parseFloat(val) || 0)
    setLocalX(num)
    onPositionChange(num, localY)
  }

  const handleYInput = (val: string) => {
    const num = clamp(parseFloat(val) || 0)
    setLocalY(num)
    onPositionChange(localX, num)
  }

  const isTextType = overlayType === "text" || overlayType === "lower_third"

  // Check if overlay is inside safe zones
  const inActionSafe =
    localX >= SAFE_ZONES.action &&
    localX <= 100 - SAFE_ZONES.action &&
    localY >= SAFE_ZONES.action &&
    localY <= 100 - SAFE_ZONES.action
  const inTitleSafe =
    localX >= SAFE_ZONES.title &&
    localX <= 100 - SAFE_ZONES.title &&
    localY >= SAFE_ZONES.title &&
    localY <= 100 - SAFE_ZONES.title

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-foreground font-medium">Position</Label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={showSafeZones ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setShowSafeZones(!showSafeZones)}
          >
            <Crosshair className="h-3 w-3" />
            Safe
          </Button>
          <Button
            type="button"
            variant={showGrid ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setShowGrid(!showGrid)}
          >
            <Grid3X3 className="h-3 w-3" />
            Grid
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-lg border-2 border-border bg-black/80 select-none"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Grid lines */}
        {showGrid && (
          <div className="pointer-events-none absolute inset-0">
            {[25, 50, 75].map((p) => (
              <div key={`v${p}`}>
                <div
                  className="absolute top-0 bottom-0 w-px bg-white/10"
                  style={{ left: `${p}%` }}
                />
                <div
                  className="absolute left-0 right-0 h-px bg-white/10"
                  style={{ top: `${p}%` }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Safe zones */}
        {showSafeZones && (
          <div className="pointer-events-none absolute inset-0">
            {/* Action safe (outer) */}
            <div
              className="absolute border border-dashed border-red-500/40"
              style={{
                top: `${SAFE_ZONES.action}%`,
                left: `${SAFE_ZONES.action}%`,
                right: `${SAFE_ZONES.action}%`,
                bottom: `${SAFE_ZONES.action}%`,
              }}
            />
            {/* Title safe (inner) */}
            <div
              className="absolute border border-dashed border-emerald-500/40"
              style={{
                top: `${SAFE_ZONES.title}%`,
                left: `${SAFE_ZONES.title}%`,
                right: `${SAFE_ZONES.title}%`,
                bottom: `${SAFE_ZONES.title}%`,
              }}
            />
            {/* Labels */}
            <span className="absolute text-[9px] text-red-400/60 font-mono" style={{ top: `${SAFE_ZONES.action + 0.5}%`, left: `${SAFE_ZONES.action + 0.5}%` }}>
              ACTION SAFE
            </span>
            <span className="absolute text-[9px] text-emerald-400/60 font-mono" style={{ top: `${SAFE_ZONES.title + 0.5}%`, left: `${SAFE_ZONES.title + 0.5}%` }}>
              TITLE SAFE
            </span>
          </div>
        )}

        {/* Center crosshair */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-6 w-px bg-white/15" />
          <div className="absolute left-1/2 top-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 bg-white/15" />
        </div>

        {/* The draggable overlay indicator */}
        <div
          className="absolute transition-none"
          style={{
            left: `${localX}%`,
            top: `${localY}%`,
            transform: "translate(-50%, -50%)",
            /* Size as % of canvas width -- use CSS calc based on container */
            width: `${Math.max(8, sizePercent)}%`,
          }}
        >
          {/* Overlay representation -- sized proportionally to canvas */}
          <div
            className={`flex w-full items-center justify-center rounded border-2 ${
              isDragging ? "border-primary shadow-lg shadow-primary/30" : "border-primary/70"
            } bg-primary/20 backdrop-blur-sm`}
            style={{
              height: isTextType ? "24px" : undefined,
              aspectRatio: isTextType ? undefined : "4/3",
            }}
          >
            {imagePath && !isTextType ? (
              <img src={imagePath} alt="" className="max-h-full max-w-full object-contain p-0.5" />
            ) : isTextType ? (
              <span className="truncate px-1 text-[8px] font-medium text-primary-foreground">
                {textContent || "Text"}
              </span>
            ) : (
              <span className="text-[8px] font-mono text-primary/80">{overlayName?.slice(0, 5)}</span>
            )}
          </div>
          {/* Position indicator dot */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className={`h-2 w-2 rounded-full ${isDragging ? "bg-primary" : "bg-primary/70"} ring-2 ring-white/50`} />
          </div>
        </div>

        {/* Coordinates display on canvas */}
        <div className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5">
          <span className="font-mono text-[10px] text-white/70">
            X: {localX.toFixed(1)}% Y: {localY.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Quick snap presets */}
      <div className="flex flex-wrap gap-1">
        {SNAP_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            variant={Math.abs(localX - preset.x) < 2 && Math.abs(localY - preset.y) < 2 ? "default" : "outline"}
            size="sm"
            className="h-6 w-8 px-0 text-[10px] font-mono"
            onClick={() => {
              setLocalX(preset.x)
              setLocalY(preset.y)
              onPositionChange(preset.x, preset.y)
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Manual X/Y inputs + alignment helpers */}
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">X (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={localX}
            onChange={(e) => handleXInput(e.target.value)}
            className="h-8 bg-secondary border-border text-foreground font-mono text-sm"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">Y (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={localY}
            onChange={(e) => handleYInput(e.target.value)}
            className="h-8 bg-secondary border-border text-foreground font-mono text-sm"
          />
        </div>
        <div className="flex gap-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            title="Align left"
            onClick={() => { setLocalX(5); onPositionChange(5, localY) }}
          >
            <AlignStartVertical className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            title="Center horizontal"
            onClick={() => { setLocalX(50); onPositionChange(50, localY) }}
          >
            <AlignCenterVertical className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            title="Align right"
            onClick={() => { setLocalX(95); onPositionChange(95, localY) }}
          >
            <AlignEndVertical className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            title="Align top"
            onClick={() => { setLocalY(5); onPositionChange(localX, 5) }}
          >
            <AlignStartHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            title="Center vertical"
            onClick={() => { setLocalY(50); onPositionChange(localX, 50) }}
          >
            <AlignCenterHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            title="Align bottom"
            onClick={() => { setLocalY(95); onPositionChange(localX, 95) }}
          >
            <AlignEndHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Safe zone status */}
      {showSafeZones && (
        <div className="flex gap-2">
          <Badge variant={inActionSafe ? "default" : "destructive"} className="text-[10px]">
            Action Safe: {inActionSafe ? "Yes" : "No"}
          </Badge>
          <Badge variant={inTitleSafe ? "default" : "destructive"} className="text-[10px]">
            Title Safe: {inTitleSafe ? "Yes" : "No"}
          </Badge>
        </div>
      )}
    </div>
  )
}
