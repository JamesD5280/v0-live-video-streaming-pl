"use client"

import { useState, useRef } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Trash2,
  Layers,
  LayoutTemplate,
  SlidersHorizontal,
  Image as ImageIcon,
  Type,
  AlertCircle,
  Loader2,
  Upload,
  Eye,
  EyeOff,
  Pencil,
  Video,
  Repeat,
  MoveHorizontal,
  Save,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Overlay, OverlayType, OverlayPosition } from "@/lib/store"
import { createClient } from "@/lib/supabase/client"
import { OverlayPreview } from "./overlay-preview"
import { GraphicsEditor } from "./graphics-editor"

const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json() })

type CanvasOverlayChange = Partial<
  Pick<Overlay, "position_x" | "position_y" | "size_percent" | "font_size" | "scroll_start_x" | "scroll_end_x">
>

const overlayTypeLabels: Record<OverlayType, string> = {
  logo: "Logo",
  bug: "Bug / Watermark",
  lower_third: "Lower Third",
  text: "Text Overlay",
  image: "Image Overlay",
  video: "Video Overlay",
  scrolling_text: "Scrolling Text (Ticker)",
}

const overlayTypeIcons: Record<OverlayType, typeof ImageIcon> = {
  logo: ImageIcon,
  bug: ImageIcon,
  lower_third: Type,
  text: Type,
  image: ImageIcon,
  video: Video,
  scrolling_text: MoveHorizontal,
}

const positionLabels: Record<OverlayPosition, string> = {
  "top-left": "Top Left",
  "top-center": "Top Center",
  "top-right": "Top Right",
  "center": "Center",
  "bottom-left": "Bottom Left",
  "bottom-center": "Bottom Center",
  "bottom-right": "Bottom Right",
}

function getPositionFromCoordinates(x: number, y: number): OverlayPosition {
  if (x < 20 && y < 20) return "top-left"
  if (x > 80 && y < 20) return "top-right"
  if (x >= 20 && x <= 80 && y < 20) return "top-center"
  if (x < 20 && y > 80) return "bottom-left"
  if (x > 80 && y > 80) return "bottom-right"
  if (x >= 20 && x <= 80 && y > 80) return "bottom-center"
  return "center"
}

const broadcastTemplates: Array<{
  label: string
  description: string
  name: string
  type: OverlayType
  position: OverlayPosition
  x: number
  y: number
  size: number
  text: string
  fontSize: number
  fontWeight: string
  bgColor: string
  scrollSpeed: number
  scrollStart: number
  scrollEnd: number
}> = [
  {
    label: "Channel bug",
    description: "Upper-right logo placement",
    name: "Channel Bug",
    type: "logo",
    position: "top-right",
    x: 92,
    y: 9,
    size: 14,
    text: "",
    fontSize: 24,
    fontWeight: "normal",
    bgColor: "transparent",
    scrollSpeed: 20,
    scrollStart: 0,
    scrollEnd: 100,
  },
  {
    label: "Lower third",
    description: "Guest name and segment title",
    name: "Guest Lower Third",
    type: "lower_third",
    position: "bottom-center",
    x: 50,
    y: 86,
    size: 70,
    text: "GUEST NAME  |  SEGMENT TITLE",
    fontSize: 36,
    fontWeight: "bold",
    bgColor: "#000000CC",
    scrollSpeed: 20,
    scrollStart: 0,
    scrollEnd: 100,
  },
  {
    label: "Breaking ticker",
    description: "Bottom crawl with an editable zone",
    name: "Breaking Ticker",
    type: "scrolling_text",
    position: "bottom-center",
    x: 50,
    y: 92,
    size: 100,
    text: "BREAKING NEWS  •  Add your update here",
    fontSize: 30,
    fontWeight: "bold",
    bgColor: "#000000CC",
    scrollSpeed: 20,
    scrollStart: 5,
    scrollEnd: 95,
  },
  {
    label: "Center title",
    description: "Large message for a title card",
    name: "Center Title",
    type: "text",
    position: "center",
    x: 50,
    y: 50,
    size: 80,
    text: "YOUR MESSAGE",
    fontSize: 56,
    fontWeight: "bold",
    bgColor: "transparent",
    scrollSpeed: 20,
    scrollStart: 0,
    scrollEnd: 100,
  },
]

export function OverlayManager() {
  const { data: overlays, error, mutate } = useSWR<Overlay[]>("/api/overlays", fetcher)
  const [creating, setCreating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [designerPanel, setDesignerPanel] = useState<"layers" | "design" | "templates">("design")
  const [selectedCanvasOverlayId, setSelectedCanvasOverlayId] = useState<string | null>(null)
  const [canvasOverlayDrafts, setCanvasOverlayDrafts] = useState<Record<string, CanvasOverlayChange>>({})
  const [canvasSaveState, setCanvasSaveState] = useState<"ready" | "editing" | "saving" | "saved" | "error">("ready")
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [name, setName] = useState("")
  const [type, setType] = useState<OverlayType>("logo")
  const [position, setPosition] = useState<OverlayPosition>("center")
  const [positionX, setPositionX] = useState(50)
  const [positionY, setPositionY] = useState(50)
  const [sizePercent, setSizePercent] = useState(15)
  const [opacity, setOpacity] = useState(100)
  const [imagePath, setImagePath] = useState("")
  const [imagePreview, setImagePreview] = useState("")
  const [textContent, setTextContent] = useState("")
  const [fontSize, setFontSize] = useState(24)
  const [fontColor, setFontColor] = useState("#ffffff")
  const [bgColor, setBgColor] = useState("#00000080")
  const [loopOverlay, setLoopOverlay] = useState(true)
  const [videoPath, setVideoPath] = useState("")
  const [videoPreviewUrl, setVideoPreviewUrl] = useState("")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [scrollSpeed, setScrollSpeed] = useState(20)
  const [scrollStartX, setScrollStartX] = useState(0)
  const [scrollEndX, setScrollEndX] = useState(100)
  const [fontFamily, setFontFamily] = useState("sans")
  const [fontWeight, setFontWeight] = useState("normal")

  const isTextType = type === "text" || type === "lower_third" || type === "scrolling_text"
  const isVideoType = type === "video"
  const canSave = !creating && !uploading && Boolean(name.trim()) &&
    (isTextType ? Boolean(textContent.trim()) : isVideoType ? Boolean(videoPath) : Boolean(imagePath))
  const tickerPassSeconds = Math.round(
    (1920 * (Math.max(5, scrollEndX - scrollStartX) / 100)) / Math.max(1, scrollSpeed)
  )
  const tickerPassLabel = `${Math.floor(tickerPassSeconds / 60)}m ${String(tickerPassSeconds % 60).padStart(2, "0")}s`
  const draftOverlay: Overlay = {
    id: editingId || "draft-overlay",
    user_id: "",
    name: name.trim() || "New overlay",
    type,
    image_path: isVideoType ? null : imagePath || null,
    video_path: isVideoType ? videoPath || null : null,
    loop_overlay: isVideoType ? loopOverlay : true,
    text_content: textContent || null,
    font_size: fontSize,
    font_color: fontColor,
    font_family: fontFamily,
    font_weight: fontWeight,
    bg_color: bgColor,
    position,
    position_x: positionX,
    position_y: positionY,
    size_percent: sizePercent,
    opacity,
    scroll_speed: type === "scrolling_text" ? scrollSpeed : null,
    scroll_start_x: type === "scrolling_text" ? scrollStartX : null,
    scroll_end_x: type === "scrolling_text" ? scrollEndX : null,
    enabled: true,
    created_at: "",
    updated_at: "",
  }

  const designerLayers = draftOverlay
    ? [draftOverlay, ...(overlays ?? []).filter((overlay) => overlay.id !== draftOverlay.id)]
    : overlays ?? []
  const canvasOverlays = (overlays ?? []).map((overlay) => ({
    ...overlay,
    ...canvasOverlayDrafts[overlay.id],
  }))
  const selectedCanvasOverlay = canvasOverlays.find((overlay) => overlay.id === selectedCanvasOverlayId)
    ?? canvasOverlays.find((overlay) => overlay.enabled)
    ?? canvasOverlays[0]

  const resetForm = () => {
    setName("")
    setType("logo")
    setPosition("center")
    setPositionX(50)
    setPositionY(50)
    setSizePercent(15)
    setOpacity(100)
    setImagePath("")
    setImagePreview("")
    setTextContent("")
    setFontSize(24)
    setFontColor("#ffffff")
    setBgColor("#00000080")
    setLoopOverlay(true)
    setVideoPath("")
    setVideoPreviewUrl("")
    setUploadProgress(0)
    setScrollSpeed(20)
    setScrollStartX(0)
    setScrollEndX(100)
    setFontFamily("sans")
    setFontWeight("normal")
    setEditingId(null)
  }

  const openCreateDialog = () => {
    resetForm()
    setDesignerPanel("design")
    setDialogOpen(true)
  }

  const openEditDialog = (overlay: Overlay) => {
    setEditingId(overlay.id)
    setName(overlay.name)
    setType(overlay.type)
    setPosition(overlay.position)
    setPositionX(overlay.position_x ?? 5)
    setPositionY(overlay.position_y ?? 5)
    setSizePercent(overlay.size_percent)
    setOpacity(overlay.opacity)
    setImagePath(overlay.image_path || "")
    setImagePreview(overlay.image_path || "")
    setTextContent(overlay.text_content || "")
    setFontSize(overlay.font_size)
    setFontColor(overlay.font_color)
    setBgColor(overlay.bg_color)
    setLoopOverlay(overlay.loop_overlay ?? true)
    setVideoPath(overlay.video_path || "")
    setVideoPreviewUrl("")
    setScrollSpeed(overlay.scroll_speed ?? 20)
    setScrollStartX(overlay.scroll_start_x ?? 0)
    setScrollEndX(overlay.scroll_end_x ?? 100)
    setFontFamily(overlay.font_family || "sans")
    setFontWeight(overlay.font_weight || "normal")
    setDesignerPanel("design")
    setDialogOpen(true)
  }

  const applyTemplate = (template: (typeof broadcastTemplates)[number]) => {
    setName(template.name)
    setType(template.type)
    setPosition(template.position)
    setPositionX(template.x)
    setPositionY(template.y)
    setSizePercent(template.size)
    setOpacity(100)
    setImagePath("")
    setImagePreview("")
    setTextContent(template.text)
    setFontSize(template.fontSize)
    setFontColor("#ffffff")
    setBgColor(template.bgColor)
    setLoopOverlay(true)
    setVideoPath("")
    setScrollSpeed(template.scrollSpeed)
    setScrollStartX(template.scrollStart)
    setScrollEndX(template.scrollEnd)
    setFontFamily("sans")
    setFontWeight(template.fontWeight)
    setDesignerPanel("design")
  }

  const handleVideoOverlayUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadProgress(0)
    try {
      // Upload video overlay to streaming server using the same chunked approach as videos
      const CHUNK_SIZE = 4 * 1024 * 1024
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
      const uploadId = `overlay-${Date.now()}`
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const chunk = file.slice(start, end)

        const formData = new FormData()
        formData.append("chunk", chunk)
        formData.append("filename", `overlay-${safeFileName}`)
        formData.append("uploadId", uploadId)
        formData.append("chunkIndex", String(i))
        formData.append("totalChunks", String(totalChunks))
        formData.append("uploadPurpose", "overlay")

        const res = await fetch("/api/videos/upload/chunk", {
          method: "POST",
          body: formData,
        })

        if (!res.ok) throw new Error("Upload failed")

        const data = await res.json()
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100))

        if (data.complete && data.serverPath) {
          setVideoPath(data.serverPath)
          setVideoPreviewUrl(data.previewUrl || "")
        }
      }
    } catch (err) {
      console.error("Video overlay upload error:", err)
    }
    setUploading(false)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const ext = file.name.split(".").pop()
      const path = `${user.id}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("overlays")
        .upload(path, file, { upsert: true })

      if (uploadError) {
        console.error("Upload error:", uploadError)
        return
      }

      const { data: urlData } = supabase.storage.from("overlays").getPublicUrl(path)
      setImagePath(urlData.publicUrl)
      setImagePreview(urlData.publicUrl)
    } catch (err) {
      console.error("Upload error:", err)
    }
    setUploading(false)
  }

  const handleSave = async () => {
    setCreating(true)
    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        name,
        type,
        position,
        position_x: positionX,
        position_y: positionY,
        size_percent: sizePercent,
        opacity,
        image_path: isVideoType ? null : (imagePath || null),
        video_path: isVideoType ? (videoPath || null) : null,
        loop_overlay: isVideoType ? loopOverlay : true,
        text_content: textContent || null,
  font_size: fontSize,
  font_color: fontColor,
  font_family: fontFamily,
  font_weight: fontWeight,
  bg_color: bgColor,
  scroll_speed: type === "scrolling_text" ? scrollSpeed : null,
  scroll_start_x: type === "scrolling_text" ? scrollStartX : null,
  scroll_end_x: type === "scrolling_text" ? scrollEndX : null,
      }

      const res = await fetch("/api/overlays", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error("Overlay save failed:", res.status, err)
        alert(`Failed to save overlay: ${err.error || res.statusText}`)
        setCreating(false)
        return
      }
      setDialogOpen(false)
      resetForm()
      void mutate().catch(() => {
        alert("Overlay saved, but the list could not refresh. Please reload the page.")
      })
    } catch (err) {
      console.error("Overlay save error:", err)
      alert("Failed to save overlay. Check console for details.")
    }
    setCreating(false)
  }

  const handleDraftChange = (change: Partial<Pick<Overlay, "position_x" | "position_y" | "size_percent" | "font_size" | "scroll_start_x" | "scroll_end_x">>) => {
    if (change.position_x !== undefined) setPositionX(change.position_x)
    if (change.position_y !== undefined) setPositionY(change.position_y)
    if (change.position_x !== undefined || change.position_y !== undefined) {
      setPosition(getPositionFromCoordinates(change.position_x ?? positionX, change.position_y ?? positionY))
    }
    if (change.size_percent !== undefined) setSizePercent(change.size_percent)
    if (change.font_size !== undefined) setFontSize(change.font_size)
    if (change.scroll_start_x !== undefined) setScrollStartX(change.scroll_start_x ?? 0)
    if (change.scroll_end_x !== undefined) setScrollEndX(change.scroll_end_x ?? 100)
  }

  const handleCanvasOverlayChange = (id: string, change: CanvasOverlayChange) => {
    setCanvasOverlayDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...change },
    }))
    setCanvasSaveState("editing")
  }

  const handleCanvasOverlayCommit = async (id: string, change: CanvasOverlayChange) => {
    const overlay = overlays?.find((item) => item.id === id)
    if (!overlay || Object.keys(change).length === 0) return

    const updates = { ...canvasOverlayDrafts[id], ...change }
    const payload = {
      id,
      ...updates,
      ...(updates.position_x !== undefined || updates.position_y !== undefined
        ? {
            position: getPositionFromCoordinates(
              updates.position_x ?? overlay.position_x,
              updates.position_y ?? overlay.position_y,
            ),
          }
        : {}),
    }

    setCanvasSaveState("saving")
    try {
      const response = await fetch("/api/overlays", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`Request failed (${response.status})`)

      setCanvasOverlayDrafts((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      setCanvasSaveState("saved")
      void mutate().catch((refreshError) => {
        console.error("Overlay list refresh error:", refreshError)
      })
    } catch (saveError) {
      console.error("Overlay canvas save error:", saveError)
      setCanvasOverlayDrafts((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      setCanvasSaveState("error")
      alert("Unable to save this overlay layout. Please try again.")
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/overlays?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!response.ok) throw new Error(`Request failed (${response.status})`)
      await mutate()
    } catch {
      alert("Unable to delete this overlay. Please try again.")
    }
  }

  const handleToggleEnabled = async (overlay: Overlay) => {
    try {
      const response = await fetch("/api/overlays", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overlay.id, enabled: !overlay.enabled }),
      })
      if (!response.ok) throw new Error(`Request failed (${response.status})`)
      await mutate()
    } catch {
      alert("Unable to update this overlay. Please try again.")
    }
  }

  const handleGraphicsSave = async (imageDataUrl: string, filename: string) => {
    try {
      // Convert data URL to blob
      const response = await fetch(imageDataUrl)
      const blob = await response.blob()
      
      // Upload to Supabase storage - use "videos" bucket which should exist
      const supabase = createClient()
      const filePath = `graphics/${Date.now()}-${filename}`
      
      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(filePath, blob, { contentType: "image/png" })
      
      if (uploadError) {
        console.error("Upload error:", uploadError)
        // Fallback: try creating an overlay without storage
        // This stores the data URL directly (works for small images)
        const res = await fetch("/api/overlays", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: filename.replace(".png", ""),
            type: "image",
            position: "bottom-center",
            position_x: 50,
            position_y: 91.5,
            size_percent: 70,
            opacity: 100,
            image_path: imageDataUrl,
            enabled: false,
          }),
        })
        if (res.ok) {
          await mutate()
        }
        return
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("videos")
        .getPublicUrl(filePath)
      
      // Create overlay with the uploaded image
      await fetch("/api/overlays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: filename.replace(".png", ""),
          type: "image",
          position: "bottom-center",
          position_x: 50,
          position_y: 91.5,
          size_percent: 70,
          opacity: 100,
          image_path: publicUrl,
          enabled: false,
        }),
      })
      
      await mutate()
    } catch (err) {
      console.error("Graphics save error:", err)
    }
  }

  if (error) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="mt-3 text-sm font-medium text-foreground">Failed to load overlays</p>
          <p className="mt-1 text-xs text-muted-foreground">Please try refreshing the page</p>
        </CardContent>
      </Card>
    )
  }

  if (!overlays) {
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
          <h2 className="text-base font-semibold text-foreground">Your Overlays</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add logos, bugs, lower thirds, and text overlays to your streams.
          </p>
        </div>
        <div className="flex gap-2">
          <GraphicsEditor onSave={handleGraphicsSave} />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" onClick={openCreateDialog}>
                <Plus className="h-3.5 w-3.5" />
                New Overlay
              </Button>
            </DialogTrigger>
          <DialogContent className="dark !fixed !inset-0 !left-0 !top-0 !z-50 !h-dvh !w-screen !max-w-none !translate-x-0 !translate-y-0 !gap-0 !rounded-none !border-0 !p-0 !flex flex-col overflow-hidden bg-background text-foreground">
            <div className="flex h-full min-h-0 flex-col">
              <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 pr-14 sm:px-6 sm:pr-16">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Stream designer</p>
                  <DialogTitle className="mt-1 truncate text-base font-semibold text-foreground">
                    {name.trim() || (editingId ? "Edit overlay" : "New overlay")}
                  </DialogTitle>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">
                    1920 × 1080
                  </span>
                  <Button onClick={handleSave} disabled={!canSave} size="sm" className="gap-2">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="hidden sm:inline">{editingId ? "Save changes" : "Create overlay"}</span>
                    <span className="sm:hidden">Save</span>
                  </Button>
                </div>
              </header>

              <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                <nav aria-label="Add overlay element" className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-border bg-card py-3 md:flex">
                  {[
                    { label: "Logo", type: "logo" as OverlayType, icon: ImageIcon },
                    { label: "Text", type: "text" as OverlayType, icon: Type },
                    { label: "Lower third", type: "lower_third" as OverlayType, icon: Layers },
                    { label: "Ticker", type: "scrolling_text" as OverlayType, icon: MoveHorizontal },
                    { label: "Video", type: "video" as OverlayType, icon: Video },
                  ].map((tool) => {
                    const ToolIcon = tool.icon
                    return (
                      <Button
                        key={tool.type}
                        type="button"
                        variant={type === tool.type ? "secondary" : "ghost"}
                        size="icon"
                        aria-label={`Add ${tool.label.toLowerCase()} overlay`}
                        title={`Add ${tool.label.toLowerCase()} overlay`}
                        onClick={() => {
                          setType(tool.type)
                          setDesignerPanel("design")
                        }}
                      >
                        <ToolIcon className="h-4 w-4" />
                      </Button>
                    )
                  })}
                </nav>

                <main aria-label="Stream preview canvas" className="flex min-h-[280px] min-w-0 flex-1 flex-col bg-secondary/30">
                  <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
                    <div>
                      <p className="text-xs font-medium text-foreground">Program preview</p>
                      <p className="text-[11px] text-muted-foreground">Drag to position · resize from the corner</p>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">16:9</span>
                  </div>
                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-5">
                    <div className="w-full max-w-[1400px]">
                      <OverlayPreview
                        overlays={overlays}
                        draftOverlay={draftOverlay}
                        draftVideoPreviewUrl={isVideoType ? videoPreviewUrl || (editingId ? `/api/overlays/preview?overlayId=${encodeURIComponent(editingId)}` : undefined) : undefined}
                        editableDraft
                        onDraftChange={handleDraftChange}
                        compact
                      />
                    </div>
                  </div>
                </main>

                <aside aria-label="Overlay editor panels" className="flex max-h-[42vh] min-h-0 w-full flex-col border-t border-border bg-card md:max-h-none md:w-[340px] md:shrink-0 md:border-l md:border-t-0">
                  <div role="group" aria-label="Designer panels" className="grid grid-cols-3 gap-1 border-b border-border p-2">
                    <button
                      type="button"
                      aria-pressed={designerPanel === "layers"}
                      onClick={() => setDesignerPanel("layers")}
                      className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground aria-pressed:bg-secondary aria-pressed:text-foreground"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Layers
                    </button>
                    <button
                      type="button"
                      aria-pressed={designerPanel === "design"}
                      onClick={() => setDesignerPanel("design")}
                      className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground aria-pressed:bg-secondary aria-pressed:text-foreground"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Design
                    </button>
                    <button
                      type="button"
                      aria-pressed={designerPanel === "templates"}
                      onClick={() => setDesignerPanel("templates")}
                      className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground aria-pressed:bg-secondary aria-pressed:text-foreground"
                    >
                      <LayoutTemplate className="h-3.5 w-3.5" />
                      Templates
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {designerPanel === "layers" && (
                      <section aria-labelledby="designer-layers-heading" className="flex flex-col gap-3">
                        <div>
                          <h3 id="designer-layers-heading" className="text-sm font-semibold text-foreground">Scene layers</h3>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Enabled overlays appear together in the stream preview.</p>
                        </div>
                        <ul className="flex flex-col gap-1.5" aria-label="Overlays in the preview">
                          {designerLayers.map((layer) => {
                            const LayerIcon = overlayTypeIcons[layer.type]
                            const isDraftLayer = layer.id === draftOverlay.id
                            return (
                              <li key={layer.id} className={cn(
                                "flex items-center gap-3 rounded-md border px-3 py-2.5",
                                isDraftLayer ? "border-primary/40 bg-primary/10" : "border-transparent bg-secondary/50"
                              )}>
                                <LayerIcon className={cn("h-4 w-4 shrink-0", isDraftLayer ? "text-primary" : "text-muted-foreground")} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-foreground">{layer.name}</span>
                                  <span className="block truncate text-xs text-muted-foreground">{overlayTypeLabels[layer.type]}</span>
                                </span>
                                {isDraftLayer && <span className="shrink-0 text-[10px] font-medium text-primary">Editing</span>}
                                {!layer.enabled && <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Disabled" />}
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    )}

                    {designerPanel === "templates" && (
                      <section aria-labelledby="designer-templates-heading" className="flex flex-col gap-3">
                        <div>
                          <h3 id="designer-templates-heading" className="text-sm font-semibold text-foreground">Broadcast templates</h3>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Start with a layout, then adjust it on the canvas.</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          {broadcastTemplates.map((template) => (
                            <button
                              key={template.label}
                              type="button"
                              onClick={() => applyTemplate(template)}
                              className="flex flex-col gap-1 rounded-md border border-border bg-secondary/40 p-3 text-left transition-colors hover:border-primary/50 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="text-sm font-medium text-foreground">{template.label}</span>
                              <span className="text-xs leading-relaxed text-muted-foreground">{template.description}</span>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}

                    {designerPanel === "design" && (
                      <div>
                        <div className="mb-4">
                          <h3 className="text-sm font-semibold text-foreground">Design properties</h3>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Changes update the canvas as you work.</p>
                        </div>
                        <div className="flex flex-col gap-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="overlay-name">Overlay Name</Label>
                <Input
                  id="overlay-name"
                  placeholder="e.g. Channel Logo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Overlay Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as OverlayType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(overlayTypeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!isTextType && !isVideoType && (
                <div className="space-y-2">
                  <Label>Image</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  {imagePreview ? (
                    <div className="relative overflow-hidden rounded-lg border border-border bg-secondary">
                      <img
                        src={imagePreview}
                        alt="Overlay preview"
                        className="mx-auto max-h-32 object-contain p-4"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute bottom-2 right-2"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50 hover:bg-secondary"
                    >
                      {uploading ? (
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      ) : (
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      )}
                      <p className="text-sm text-muted-foreground">
                        {uploading ? "Uploading..." : "Click to upload image (PNG, SVG, WEBP)"}
                      </p>
                    </button>
                  )}
                </div>
              )}

              {isVideoType && (
                <div className="space-y-3">
                  <Label>Video File (.MOV, .MP4)</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mov,.mp4,.webm"
                    className="hidden"
                    onChange={handleVideoOverlayUpload}
                  />
                  {videoPath ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary p-3">
                      <Video className="h-8 w-8 text-primary" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">Video uploaded</p>
                        <p className="text-xs text-muted-foreground truncate">{videoPath.split("/").pop()}</p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50 hover:bg-secondary"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Uploading... {uploadProgress}%</p>
                          <div className="h-1.5 w-full max-w-xs rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Click to upload rotating logo or animation (.MOV, .MP4)</p>
                        </>
                      )}
                    </button>
                  )}

                  <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary p-3">
                    <Repeat className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Loop Video</p>
                      <p className="text-xs text-muted-foreground">Continuously loop the overlay during the stream</p>
                    </div>
                    <Switch checked={loopOverlay} onCheckedChange={setLoopOverlay} />
                  </div>
                </div>
              )}

              {isTextType && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="overlay-text">Text Content</Label>
                    <Input
                      id="overlay-text"
                      placeholder="e.g. Breaking News: ..."
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Font Family</Label>
                      <Select value={fontFamily} onValueChange={setFontFamily}>
                        <SelectTrigger className="bg-secondary border-border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="viga">Viga (Google Font)</SelectItem>
                          <SelectItem value="sans">Sans Serif (DejaVu Sans)</SelectItem>
                          <SelectItem value="serif">Serif (DejaVu Serif)</SelectItem>
                          <SelectItem value="mono">Monospace (DejaVu Mono)</SelectItem>
                          <SelectItem value="arial">Arial (Liberation Sans)</SelectItem>
                          <SelectItem value="times">Times (Liberation Serif)</SelectItem>
                          <SelectItem value="courier">Courier (Liberation Mono)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Font Weight</Label>
                      <Select value={fontWeight} onValueChange={setFontWeight}>
                        <SelectTrigger className="bg-secondary border-border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="bold">Bold</SelectItem>
                          <SelectItem value="italic">Italic</SelectItem>
                          <SelectItem value="bold-italic">Bold Italic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Font Size</Label>
                      <Input
                        type="number"
                        min={12}
                        max={120}
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Font Color</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={fontColor}
                          onChange={(e) => setFontColor(e.target.value)}
                          className="h-9 w-9 cursor-pointer rounded border border-border"
                        />
                        <Input
                          value={fontColor}
                          onChange={(e) => setFontColor(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    {type !== "text" && (
                      <div className="space-y-2">
                        <Label>Background</Label>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={bgColor === "transparent"}
                              onChange={(e) => setBgColor(e.target.checked ? "transparent" : "#00000080")}
                              className="rounded border-border"
                            />
                            No Background
                          </label>
                        </div>
                        {bgColor !== "transparent" && (
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={bgColor.slice(0, 7)}
                              onChange={(e) => setBgColor(e.target.value + "80")}
                              className="h-9 w-9 cursor-pointer rounded border border-border"
                            />
                            <Input
                              value={bgColor}
                              onChange={(e) => setBgColor(e.target.value)}
                              className="flex-1"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {type === "scrolling_text" && (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Scroll Speed</Label>
                          <span className="text-xs text-muted-foreground">{scrollSpeed} px/sec</span>
                        </div>
                        <Slider
                          value={[scrollSpeed]}
                          onValueChange={(v) => setScrollSpeed(v[0])}
                          min={5}
                          max={100}
                          step={1}
                        />
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Approximate time across this zone: {tickerPassLabel}. The preview uses this same pixel-per-second speed.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label>Visible zone left edge (exit)</Label>
                          <span className="text-xs text-muted-foreground">{scrollStartX}%</span>
                        </div>
                        <Slider
                          value={[scrollStartX]}
                          onValueChange={(v) => setScrollStartX(Math.min(v[0], scrollEndX - 5))}
                          min={0}
                          max={90}
                          step={1}
                        />
                        <p className="text-xs text-muted-foreground">
                          Where text disappears (left boundary). Set to match your left logo edge.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label>Visible zone right edge (entry)</Label>
                          <span className="text-xs text-muted-foreground">{scrollEndX}%</span>
                        </div>
                        <Slider
                          value={[scrollEndX]}
                          onValueChange={(v) => setScrollEndX(Math.max(v[0], scrollStartX + 5))}
                          min={10}
                          max={100}
                          step={1}
                        />
                        <p className="text-xs text-muted-foreground">
                          Where text appears (right boundary). Set to match your right logo edge.
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}

              {!isTextType && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Width on stream</Label>
                    <span className="text-xs text-muted-foreground">{sizePercent}%</span>
                  </div>
                  <Slider
                    value={[sizePercent]}
                    onValueChange={(v) => setSizePercent(v[0])}
                    min={5}
                    max={100}
                    step={1}
                  />
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Opacity</Label>
                  <span className="text-xs text-muted-foreground">{opacity}%</span>
                </div>
                <Slider
                  value={[opacity]}
                  onValueChange={(v) => setOpacity(v[0])}
                  min={10}
                  max={100}
                  step={5}
                />
              </div>

                        </div>
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {overlays.length > 0 && (
        <section aria-label="Stream graphics editor" className="dark overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
          <header className="flex flex-col gap-3 border-b border-border bg-background px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Stream designer</p>
              <h2 className="mt-1 text-base font-semibold text-foreground">Arrange overlays on the stream</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Select an overlay, then drag it into position. Resize it from the corner handle.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span aria-live="polite" className={cn(
                "font-medium",
                canvasSaveState === "error" ? "text-destructive" : canvasSaveState === "saved" ? "text-primary" : "text-muted-foreground",
              )}>
                {canvasSaveState === "saving" ? "Saving layout…" : canvasSaveState === "saved" ? "Changes saved" : canvasSaveState === "error" ? "Save failed" : canvasSaveState === "editing" ? "Unsaved position changes" : "Ready to edit"}
              </span>
              <span className="rounded border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">1920 × 1080</span>
            </div>
          </header>

          <div className="flex min-h-0 flex-col xl:flex-row">
            <main aria-label="Stream preview canvas" className="min-w-0 flex-1 bg-secondary/30 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Program output</span>
                <span className="font-mono text-[10px] text-muted-foreground">16:9</span>
              </div>
              <OverlayPreview
                overlays={canvasOverlays}
                compact
                selectedOverlayId={selectedCanvasOverlay?.id}
                onOverlaySelect={setSelectedCanvasOverlayId}
                onOverlayChange={handleCanvasOverlayChange}
                onOverlayCommit={handleCanvasOverlayCommit}
              />
              {selectedCanvasOverlay && (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Selected: <span className="font-medium text-foreground">{selectedCanvasOverlay.name}</span>
                  <span aria-hidden="true"> · </span>
                  {Math.round(selectedCanvasOverlay.position_x ?? 50)}% horizontal, {Math.round(selectedCanvasOverlay.position_y ?? 50)}% vertical
                  <span aria-hidden="true"> · </span>
                  {selectedCanvasOverlay.type === "text" || selectedCanvasOverlay.type === "lower_third"
                    ? `${selectedCanvasOverlay.font_size}px type`
                    : selectedCanvasOverlay.type === "scrolling_text"
                      ? `${Math.round((selectedCanvasOverlay.scroll_end_x ?? 100) - (selectedCanvasOverlay.scroll_start_x ?? 0))}% ticker zone`
                      : `${selectedCanvasOverlay.size_percent}% width`}
                </p>
              )}
            </main>

            <aside aria-label="Overlay layers" className="flex w-full flex-col border-t border-border bg-background xl:w-80 xl:shrink-0 xl:border-l xl:border-t-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Layers</h3>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{overlays.length}</span>
              </div>

              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto p-2 xl:max-h-[30rem]" aria-label="Overlays in stream order">
                {overlays.map((overlay) => {
                  const LayerIcon = overlayTypeIcons[overlay.type]
                  const selected = selectedCanvasOverlay?.id === overlay.id
                  return (
                    <li key={overlay.id} className={cn(
                      "flex items-center gap-1 rounded-md border px-1",
                      selected ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-secondary/70",
                    )}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedCanvasOverlayId(overlay.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <LayerIcon className={cn("h-4 w-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{overlay.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{overlayTypeLabels[overlay.type]}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`${overlay.enabled ? "Disable" : "Enable"} ${overlay.name}`}
                        title={`${overlay.enabled ? "Disable" : "Enable"} ${overlay.name}`}
                        onClick={() => void handleToggleEnabled(overlay)}
                        className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {overlay.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                    </li>
                  )
                })}
              </ul>

              {selectedCanvasOverlay && (
                <div className="border-t border-border p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Selected layer</p>
                  <p className="mt-1 truncate text-sm font-semibold text-foreground">{selectedCanvasOverlay.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {positionLabels[getPositionFromCoordinates(selectedCanvasOverlay.position_x ?? 50, selectedCanvasOverlay.position_y ?? 50)]}
                  </p>
                  <Button type="button" variant="outline" size="sm" className="mt-3 w-full gap-2" onClick={() => openEditDialog(selectedCanvasOverlay)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit properties
                  </Button>
                </div>
              )}
            </aside>
          </div>
        </section>
      )}

      {overlays.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Layers className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">No overlays yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Add logos, bugs, and text overlays to your streams</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={openCreateDialog}>
              <Plus className="h-3.5 w-3.5" />
              Create Overlay
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overlays.map((overlay) => {
            const Icon = overlayTypeIcons[overlay.type]
            return (
              <Card key={overlay.id} className="border-border bg-card">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold text-foreground">
                          {overlay.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {overlayTypeLabels[overlay.type]} -- {positionLabels[overlay.position]}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overlay.image_path && overlay.type !== "video" && (
                    <div className="overflow-hidden rounded-md bg-secondary">
                      <img
                        src={overlay.image_path}
                        alt={overlay.name}
                        className="mx-auto max-h-20 object-contain p-2"
                      />
                    </div>
                  )}
                  {overlay.type === "video" && overlay.video_path && (
                    <div className="flex items-center gap-2 rounded-md bg-secondary p-2">
                      <Video className="h-5 w-5 text-primary" />
                      <span className="truncate text-xs text-muted-foreground">{overlay.video_path.split("/").pop()}</span>
                      {overlay.loop_overlay && <Repeat className="h-3.5 w-3.5 text-primary" />}
                    </div>
                  )}
                  {overlay.text_content && (
                    <div className="rounded-md bg-secondary p-2">
                      <p className="truncate text-sm text-foreground">{overlay.text_content}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Size: {overlay.size_percent}%</span>
                    <span>Opacity: {overlay.opacity}%</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => handleToggleEnabled(overlay)}
                    >
                      {overlay.enabled ? (
                        <>
                          <Eye className="h-3 w-3" />
                          Enabled
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3 w-3 text-muted-foreground" />
                          Disabled
                        </>
                      )}
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditDialog(overlay)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(overlay.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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
