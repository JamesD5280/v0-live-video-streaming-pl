"use client"

import { useState, useCallback } from "react"
import { Upload, Film, X, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface UploadFile {
  name: string
  size: string
  progress: number
  status: "uploading" | "processing" | "complete" | "error"
}

export function VideoUpload() {
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

  const simulateUpload = useCallback((fileName: string, fileSize: string) => {
    const newFile: UploadFile = {
      name: fileName,
      size: fileSize,
      progress: 0,
      status: "uploading",
    }
    setUploads((prev) => [...prev, newFile])

    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 15
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
        setUploads((prev) =>
          prev.map((f) =>
            f.name === fileName ? { ...f, progress: 100, status: "processing" } : f
          )
        )
        setTimeout(() => {
          setUploads((prev) =>
            prev.map((f) =>
              f.name === fileName ? { ...f, status: "complete" } : f
            )
          )
        }, 2000)
      } else {
        setUploads((prev) =>
          prev.map((f) =>
            f.name === fileName ? { ...f, progress: Math.round(progress) } : f
          )
        )
      }
    }, 300)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      files.forEach((file) => {
        simulateUpload(file.name, `${(file.size / (1024 * 1024)).toFixed(1)} MB`)
      })
    },
    [simulateUpload]
  )

  const handleFileSelect = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "video/*"
    input.multiple = true
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      files.forEach((file) => {
        simulateUpload(file.name, `${(file.size / (1024 * 1024)).toFixed(1)} MB`)
      })
    }
    input.click()
  }, [simulateUpload])

  const removeUpload = useCallback((name: string) => {
    setUploads((prev) => prev.filter((f) => f.name !== name))
  }, [])

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleFileSelect}
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
            <Card key={file.name} className="border-border bg-card">
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
                          {file.status === "processing"
                            ? "Processing..."
                            : `${file.progress}%`}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => removeUpload(file.name)}
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
