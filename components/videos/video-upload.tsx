"use client"

import { useState, useCallback } from "react"
import { Upload, Film, X, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface UploadFile {
  id: string
  name: string
  size: string
  sizeBytes: number
  progress: number
  status: "uploading" | "processing" | "complete" | "error"
}

export function VideoUpload({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploads, setUploads] = useState<UploadFile[]>([])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const processFile = useCallback(async (file: File) => {
    const id = crypto.randomUUID()
    const newFile: UploadFile = {
      id,
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      sizeBytes: file.size,
      progress: 0,
      status: "uploading",
    }
    setUploads((prev) => [...prev, newFile])

    // Simulate upload progress
    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 15
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
        setUploads((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, progress: 100, status: "processing" } : f
          )
        )
        // Save to DB
        const format = file.name.split(".").pop()?.toUpperCase() || "MP4"
        fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: file.name.replace(/\.[^/.]+$/, ""),
            filename: file.name,
            file_size: file.size,
            format,
          }),
        }).then(() => {
          setUploads((prev) =>
            prev.map((f) =>
              f.id === id ? { ...f, status: "complete" } : f
            )
          )
          onUploadComplete?.()
        }).catch(() => {
          setUploads((prev) =>
            prev.map((f) =>
              f.id === id ? { ...f, status: "error" } : f
            )
          )
        })
      } else {
        setUploads((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, progress: Math.round(progress) } : f
          )
        )
      }
    }, 300)
  }, [onUploadComplete])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      files.forEach(processFile)
    },
    [processFile]
  )

  const handleFileSelect = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "video/*"
    input.multiple = true
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      files.forEach(processFile)
    }
    input.click()
  }, [processFile])

  const removeUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((f) => f.id !== id))
  }, [])

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleFileSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleFileSelect() }}
        className={cn(
          "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-secondary/50"
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Drop your video files here, or click to browse
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Supports MP4, MKV, MOV, AVI, FLV up to 10 GB
            </p>
          </div>
        </div>
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((file) => (
            <Card key={file.id} className="border-border bg-card">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                  <Film className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <div className="flex items-center gap-2">
                      {file.status === "complete" ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {file.status === "processing" ? "Saving..." : `${file.progress}%`}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => removeUpload(file.id)}
                      >
                        <X className="h-3 w-3" />
                        <span className="sr-only">Remove upload</span>
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{file.size}</p>
                  {file.status === "uploading" && (
                    <Progress value={file.progress} className="mt-2 h-1" />
                  )}
                  {file.status === "processing" && (
                    <Progress value={100} className="mt-2 h-1 animate-pulse" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
