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
  DialogHeader,
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
} from "lucide-react"
import type { Overlay, OverlayType, OverlayPosition } from "@/lib/store"
import { createClient } from "@/lib/supabase/client"
import { OverlayPreview } from "./overlay-preview"
import { OverlayPositionEditor } from "./overlay-position-editor"

const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json() })

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

export function OverlayManager() {
  const { data: overlays, error, mutate } = useSWR<Overlay[]>("/api/overlays", fetcher)
  const [creating, setCreating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [name, setName] = useState("")
  const [type, setType] = useState<OverlayType>("logo")
  const [position, setPosition] = useState<OverlayPosition>("top-left")
  const [positionX, setPositionX] = useState(5)
  const [positionY, setPositionY] = useState(5)
  const [sizePercent, setSizePercent] = useState(100)
  const [opacity, setOpacity] = useState(100)
  const [imagePath, setImagePath] = useState("")
  const [imagePreview, setImagePreview] = useState("")
  const [textContent, setTextContent] = useState("")
  const [fontSize, setFontSize] = useState(24)
  const [fontColor, setFontColor] = useState("#ffffff")
  const [bgColor, setBgColor] = useState("#00000080")
  const [loopOverlay, setLoopOverlay] = useState(true)
  const [videoPath, setVideoPath] = useState("")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [scrollSpeed, setScrollSpeed] = useState(100)

  const isTextType = type === "text" || type === "lower_third" || type === "scrolling_text"
  const isVideoType = type === "video"

  const resetForm = () => {
    setName("")
    setType("logo")
    setPosition("top-left")
    setPositionX(0)
    setPositionY(0)
    setSizePercent(100)
    setOpacity(100)
    setImagePath("")
    setImagePreview("")
    setTextContent("")
    setFontSize(24)
    setFontColor("#ffffff")
    setBgColor("#00000080")
    setLoopOverlay(true)
    setVideoPath("")
    setUploadProgress(0)
    setScrollSpeed(100)
    setEditingId(null)
  }

  const openCreateDialog = () => {
    resetForm()
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
    setScrollSpeed(overlay.scroll_speed ?? 100)
    setDialogOpen(true)
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

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const chunk = file.slice(start, end)

        const formData = new FormData()
        formData.append("chunk", chunk)
        formData.append("filename", `overlay-${file.name}`)
        formData.append("uploadId", uploadId)
        formData.append("chunkIndex", String(i))
        formData.append("totalChunks", String(totalChunks))

        const res = await fetch("/api/videos/upload/chunk", {
          method: "POST",
          body: formData,
        })

        if (!res.ok) throw new Error("Upload failed")

        const data = await res.json()
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100))

        if (data.complete && data.serverPath) {
          setVideoPath(data.serverPath)
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
        bg_color: bgColor,
        scroll_speed: type === "scrolling_text" ? scrollSpeed : null,
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
      mutate()
    } catch (err) {
      console.error("Overlay save error:", err)
      alert("Failed to save overlay. Check console for details.")
    }
    setCreating(false)
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/overlays?id=${id}`, { method: "DELETE" })
    mutate()
  }

  const handleToggleEnabled = async (overlay: Overlay) => {
    await fetch("/api/overlays", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: overlay.id, enabled: !overlay.enabled }),
    })
    mutate()
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" onClick={openCreateDialog}>
              <Plus className="h-3.5 w-3.5" />
              New Overlay
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Overlay" : "Create Overlay"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
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
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Font Size</Label>
                      <Input
                        type="number"
                        min={12}
                        max={72}
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
                  </div>

                  {type === "scrolling_text" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Scroll Speed</Label>
                        <span className="text-xs text-muted-foreground">{scrollSpeed} px/sec</span>
                      </div>
                      <Slider
                        value={[scrollSpeed]}
                        onValueChange={(v) => setScrollSpeed(v[0])}
                        min={20}
                        max={400}
                        step={10}
                      />
                      <p className="text-xs text-muted-foreground">
                        Controls how fast text scrolls across the screen (left to right ticker style).
                      </p>
                    </div>
                  )}
                </>
              )}

              <OverlayPositionEditor
                positionX={positionX}
                positionY={positionY}
                onPositionChange={(x, y) => {
                  setPositionX(x)
                  setPositionY(y)
                  // Auto-set the legacy position field based on nearest preset
                  if (x < 20 && y < 20) setPosition("top-left")
                  else if (x > 80 && y < 20) setPosition("top-right")
                  else if (x >= 20 && x <= 80 && y < 20) setPosition("top-center")
                  else if (x < 20 && y > 80) setPosition("bottom-left")
                  else if (x > 80 && y > 80) setPosition("bottom-right")
                  else if (x >= 20 && x <= 80 && y > 80) setPosition("bottom-center")
                  else setPosition("center")
                }}
                overlayType={type}
                overlayName={name}
                imagePath={imagePath || null}
                textContent={textContent || null}
                sizePercent={sizePercent}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Size</Label>
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

              <Button
                onClick={handleSave}
                disabled={creating || !name.trim() || (!isTextType && !isVideoType && !imagePath) || (isTextType && !textContent.trim()) || (isVideoType && !videoPath) || (type === "scrolling_text" && !textContent.trim())}
                className="w-full"
              >
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? "Save Changes" : "Create Overlay"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Live Preview Canvas */}
      {overlays.length > 0 && (
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <OverlayPreview overlays={overlays} />
          </CardContent>
        </Card>
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
