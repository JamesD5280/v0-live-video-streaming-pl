"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Paintbrush, Download, Save, Loader2 } from "lucide-react"

interface GraphicsEditorProps {
  onSave?: (imageDataUrl: string, filename: string) => void
  initialWidth?: number
  initialHeight?: number
}

interface GradientStop {
  color: string
  position: number
}

export function GraphicsEditor({ 
  onSave, 
  initialWidth = 1920, 
  initialHeight = 50 
}: GraphicsEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filename, setFilename] = useState("scroll-background")
  
  // Bar dimensions
  const [width, setWidth] = useState(initialWidth)
  const [height, setHeight] = useState(initialHeight)
  
  // Fill type: solid or gradient
  const [fillType, setFillType] = useState<"solid" | "gradient">("solid")
  
  // Solid color
  const [solidColor, setSolidColor] = useState("#1a1a2e")
  const [solidOpacity, setSolidOpacity] = useState(90)
  
  // Gradient
  const [gradientType, setGradientType] = useState<"horizontal" | "vertical">("horizontal")
  const [gradientStops, setGradientStops] = useState<GradientStop[]>([
    { color: "#1a1a2e", position: 0 },
    { color: "#16213e", position: 50 },
    { color: "#1a1a2e", position: 100 },
  ])
  const [gradientOpacity, setGradientOpacity] = useState(90)
  
  // Border
  const [borderEnabled, setBorderEnabled] = useState(true)
  const [borderColor, setBorderColor] = useState("#ffd700")
  const [borderWidth, setBorderWidth] = useState(2)
  const [borderPosition, setBorderPosition] = useState<"top" | "bottom" | "both">("both")
  
  // Corner radius
  const [cornerRadius, setCornerRadius] = useState(0)
  
  // Decorative elements
  const [decorationType, setDecorationType] = useState<"none" | "stripe" | "dots">("none")
  const [decorationColor, setDecorationColor] = useState("#ffffff20")

  // Draw the graphic on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    
    // Set canvas size
    canvas.width = width
    canvas.height = height
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    
    // Draw rounded rectangle path
    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + h - r)
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      ctx.lineTo(x + r, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
    }
    
    // Apply opacity
    const opacity = fillType === "solid" ? solidOpacity / 100 : gradientOpacity / 100
    ctx.globalAlpha = opacity
    
    // Fill background
    if (fillType === "solid") {
      ctx.fillStyle = solidColor
      drawRoundedRect(0, 0, width, height, cornerRadius)
      ctx.fill()
    } else {
      // Gradient
      let gradient: CanvasGradient
      if (gradientType === "horizontal") {
        gradient = ctx.createLinearGradient(0, 0, width, 0)
      } else {
        gradient = ctx.createLinearGradient(0, 0, 0, height)
      }
      
      gradientStops.forEach(stop => {
        gradient.addColorStop(stop.position / 100, stop.color)
      })
      
      ctx.fillStyle = gradient
      drawRoundedRect(0, 0, width, height, cornerRadius)
      ctx.fill()
    }
    
    // Reset opacity for decorations and borders
    ctx.globalAlpha = 1
    
    // Draw decorations
    if (decorationType === "stripe") {
      ctx.fillStyle = decorationColor
      const stripeWidth = 20
      const gap = 40
      ctx.save()
      ctx.clip()
      for (let x = -height; x < width + height; x += gap) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + stripeWidth, 0)
        ctx.lineTo(x + stripeWidth + height, height)
        ctx.lineTo(x + height, height)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    } else if (decorationType === "dots") {
      ctx.fillStyle = decorationColor
      const dotRadius = 3
      const gap = 30
      for (let x = gap; x < width; x += gap) {
        ctx.beginPath()
        ctx.arc(x, height / 2, dotRadius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    
    // Draw borders
    if (borderEnabled && borderWidth > 0) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = borderWidth
      
      if (borderPosition === "top" || borderPosition === "both") {
        ctx.beginPath()
        ctx.moveTo(0, borderWidth / 2)
        ctx.lineTo(width, borderWidth / 2)
        ctx.stroke()
      }
      
      if (borderPosition === "bottom" || borderPosition === "both") {
        ctx.beginPath()
        ctx.moveTo(0, height - borderWidth / 2)
        ctx.lineTo(width, height - borderWidth / 2)
        ctx.stroke()
      }
    }
  }, [
    width, height, fillType, solidColor, solidOpacity,
    gradientType, gradientStops, gradientOpacity,
    borderEnabled, borderColor, borderWidth, borderPosition,
    cornerRadius, decorationType, decorationColor
  ])

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const link = document.createElement("a")
    link.download = `${filename}.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }

  const handleSave = async () => {
    const canvas = canvasRef.current
    if (!canvas || !onSave) return
    
    setSaving(true)
    try {
      const dataUrl = canvas.toDataURL("image/png")
      await onSave(dataUrl, `${filename}.png`)
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const updateGradientStop = (index: number, field: "color" | "position", value: string | number) => {
    const newStops = [...gradientStops]
    newStops[index] = { ...newStops[index], [field]: value }
    setGradientStops(newStops)
  }

  const addGradientStop = () => {
    if (gradientStops.length < 5) {
      setGradientStops([...gradientStops, { color: "#333333", position: 50 }])
    }
  }

  const removeGradientStop = (index: number) => {
    if (gradientStops.length > 2) {
      setGradientStops(gradientStops.filter((_, i) => i !== index))
    }
  }

  // Preset templates
  const applyPreset = (preset: string) => {
    switch (preset) {
      case "gold-bar":
        setFillType("gradient")
        setGradientType("vertical")
        setGradientStops([
          { color: "#ffd700", position: 0 },
          { color: "#b8860b", position: 50 },
          { color: "#ffd700", position: 100 },
        ])
        setBorderEnabled(true)
        setBorderColor("#8b6914")
        setBorderPosition("both")
        break
      case "news-ticker":
        setFillType("solid")
        setSolidColor("#cc0000")
        setBorderEnabled(true)
        setBorderColor("#ffffff")
        setBorderWidth(2)
        setBorderPosition("both")
        break
      case "dark-glass":
        setFillType("gradient")
        setGradientType("vertical")
        setGradientStops([
          { color: "#000000", position: 0 },
          { color: "#1a1a1a", position: 50 },
          { color: "#000000", position: 100 },
        ])
        setGradientOpacity(80)
        setBorderEnabled(true)
        setBorderColor("#333333")
        break
      case "blue-gradient":
        setFillType("gradient")
        setGradientType("horizontal")
        setGradientStops([
          { color: "#1e3a5f", position: 0 },
          { color: "#2563eb", position: 50 },
          { color: "#1e3a5f", position: 100 },
        ])
        setBorderEnabled(true)
        setBorderColor("#60a5fa")
        break
      case "green-broadcast":
        setFillType("solid")
        setSolidColor("#047857")
        setBorderEnabled(true)
        setBorderColor("#34d399")
        setBorderWidth(3)
        break
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Paintbrush className="h-4 w-4 mr-2" />
          Graphics Editor
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Graphics Editor - Create Scroll Bar Background</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Preview */}
          <div className="space-y-4">
            <Label>Preview</Label>
            <div className="border rounded-lg p-4 bg-muted/50 overflow-hidden">
              <div className="relative w-full" style={{ 
                aspectRatio: `${width}/${Math.max(height, 50)}`,
                maxHeight: "200px"
              }}>
                <canvas
                  ref={canvasRef}
                  className="w-full h-full object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            </div>
            
            {/* Presets */}
            <div className="space-y-2">
              <Label>Quick Presets</Label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => applyPreset("gold-bar")}>
                  Gold Bar
                </Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset("news-ticker")}>
                  News Ticker
                </Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset("dark-glass")}>
                  Dark Glass
                </Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset("blue-gradient")}>
                  Blue Gradient
                </Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset("green-broadcast")}>
                  Green Broadcast
                </Button>
              </div>
            </div>
            
            {/* Dimensions */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Width (px)</Label>
                <Input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  min={100}
                  max={1920}
                />
              </div>
              <div className="space-y-2">
                <Label>Height (px)</Label>
                <Input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  min={20}
                  max={200}
                />
              </div>
            </div>
            
            {/* Filename and actions */}
            <div className="space-y-2">
              <Label>Filename</Label>
              <Input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="scroll-background"
              />
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleDownload} variant="outline" className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download PNG
              </Button>
              {onSave && (
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save as Overlay
                </Button>
              )}
            </div>
          </div>
          
          {/* Controls */}
          <div className="space-y-4">
            <Tabs defaultValue="fill" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="fill">Fill</TabsTrigger>
                <TabsTrigger value="border">Border</TabsTrigger>
                <TabsTrigger value="decoration">Decoration</TabsTrigger>
              </TabsList>
              
              <TabsContent value="fill" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Fill Type</Label>
                  <Select value={fillType} onValueChange={(v: "solid" | "gradient") => setFillType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solid">Solid Color</SelectItem>
                      <SelectItem value="gradient">Gradient</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {fillType === "solid" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Color</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={solidColor}
                          onChange={(e) => setSolidColor(e.target.value)}
                          className="w-12 h-10 rounded border cursor-pointer"
                        />
                        <Input
                          value={solidColor}
                          onChange={(e) => setSolidColor(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label>Opacity</Label>
                        <span className="text-sm text-muted-foreground">{solidOpacity}%</span>
                      </div>
                      <Slider
                        value={[solidOpacity]}
                        onValueChange={(v) => setSolidOpacity(v[0])}
                        min={0}
                        max={100}
                        step={5}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Gradient Direction</Label>
                      <Select value={gradientType} onValueChange={(v: "horizontal" | "vertical") => setGradientType(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="horizontal">Horizontal</SelectItem>
                          <SelectItem value="vertical">Vertical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Gradient Stops</Label>
                        {gradientStops.length < 5 && (
                          <Button size="sm" variant="ghost" onClick={addGradientStop}>
                            + Add Stop
                          </Button>
                        )}
                      </div>
                      {gradientStops.map((stop, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={stop.color}
                            onChange={(e) => updateGradientStop(i, "color", e.target.value)}
                            className="w-10 h-8 rounded border cursor-pointer"
                          />
                          <Input
                            type="number"
                            value={stop.position}
                            onChange={(e) => updateGradientStop(i, "position", Number(e.target.value))}
                            min={0}
                            max={100}
                            className="w-20"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                          {gradientStops.length > 2 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeGradientStop(i)}
                              className="text-destructive"
                            >
                              ×
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label>Opacity</Label>
                        <span className="text-sm text-muted-foreground">{gradientOpacity}%</span>
                      </div>
                      <Slider
                        value={[gradientOpacity]}
                        onValueChange={(v) => setGradientOpacity(v[0])}
                        min={0}
                        max={100}
                        step={5}
                      />
                    </div>
                  </>
                )}
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Corner Radius</Label>
                    <span className="text-sm text-muted-foreground">{cornerRadius}px</span>
                  </div>
                  <Slider
                    value={[cornerRadius]}
                    onValueChange={(v) => setCornerRadius(v[0])}
                    min={0}
                    max={25}
                    step={1}
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="border" className="space-y-4 mt-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="borderEnabled"
                    checked={borderEnabled}
                    onChange={(e) => setBorderEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="borderEnabled">Enable Border</Label>
                </div>
                
                {borderEnabled && (
                  <>
                    <div className="space-y-2">
                      <Label>Border Color</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={borderColor}
                          onChange={(e) => setBorderColor(e.target.value)}
                          className="w-12 h-10 rounded border cursor-pointer"
                        />
                        <Input
                          value={borderColor}
                          onChange={(e) => setBorderColor(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label>Border Width</Label>
                        <span className="text-sm text-muted-foreground">{borderWidth}px</span>
                      </div>
                      <Slider
                        value={[borderWidth]}
                        onValueChange={(v) => setBorderWidth(v[0])}
                        min={1}
                        max={10}
                        step={1}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Border Position</Label>
                      <Select value={borderPosition} onValueChange={(v: "top" | "bottom" | "both") => setBorderPosition(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="top">Top Only</SelectItem>
                          <SelectItem value="bottom">Bottom Only</SelectItem>
                          <SelectItem value="both">Top & Bottom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </TabsContent>
              
              <TabsContent value="decoration" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Decoration Type</Label>
                  <Select value={decorationType} onValueChange={(v: "none" | "stripe" | "dots") => setDecorationType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="stripe">Diagonal Stripes</SelectItem>
                      <SelectItem value="dots">Dots</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {decorationType !== "none" && (
                  <div className="space-y-2">
                    <Label>Decoration Color</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={decorationColor.substring(0, 7)}
                        onChange={(e) => setDecorationColor(e.target.value + "20")}
                        className="w-12 h-10 rounded border cursor-pointer"
                      />
                      <Input
                        value={decorationColor}
                        onChange={(e) => setDecorationColor(e.target.value)}
                        className="flex-1"
                        placeholder="#ffffff20"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Add transparency with hex (e.g., #ffffff20 for 20% white)
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
