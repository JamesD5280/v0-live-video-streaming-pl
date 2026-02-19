"use client"

import { useState, useCallback } from "react"
import { Upload, Film, X, CheckCircle2, AlertCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface UploadFile {
  id: string
  file: File
  name: string
  size: string
  sizeBytes: number
  progress: number
  status: "uploading" | "saving" | "complete" | "error"
  errorMessage?: string
  abortController?: AbortController
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
    const abortController = new AbortController()

    const newFile: UploadFile = {
      id,
      file,
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      sizeBytes: file.size,
      progress: 0,
      status: "uploading",
      abortController,
    }
    setUploads((prev) => [...prev, newFile])

    try {
      // Step 1: Get the upload URL and auth token from our API
      const urlRes = await fetch(`/api/videos/upload?filename=${encodeURIComponent(file.name)}`)
      const urlData = await urlRes.json()

      if (urlData.error) {
        throw new Error(urlData.error)
      }

      // Step 2: Upload the file directly to the streaming server using XMLHttpRequest for progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100)
            setUploads((prev) =>
              prev.map((f) => (f.id === id ? { ...f, progress: percent } : f))
            )
          }
        })

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            let errMsg = "Upload failed"
            try {
              const resp = JSON.parse(xhr.responseText)
              errMsg = resp.error || errMsg
            } catch {}
            reject(new Error(errMsg))
          }
        })

        xhr.addEventListener("error", () => reject(new Error("Network error during upload")))
        xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")))

        abortController.signal.addEventListener("abort", () => xhr.abort())

        xhr.open("POST", urlData.uploadUrl)
        xhr.setRequestHeader("Authorization", `Bearer ${urlData.authToken}`)
        xhr.setRequestHeader("x-filename", file.name)
        xhr.send(file)
      })

      // Step 3: Save metadata to database
      setUploads((prev) =>
        prev.map((f) => (f.id === id ? { ...f, progress: 100, status: "saving" } : f))
      )

      const format = file.name.split(".").pop()?.toUpperCase() || "MP4"
      const metaRes = await fetch("/api/videos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: file.name.replace(/\.[^/.]+$/, ""),
          filename: file.name,
          file_size: file.size,
          format,
        }),
      })

      if (!metaRes.ok) {
        const err = await metaRes.json()
        throw new Error(err.error || "Failed to save video metadata")
      }

      setUploads((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "complete" } : f))
      )
      onUploadComplete?.()
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Upload failed"
      if (errorMessage === "Upload cancelled") {
        setUploads((prev) => prev.filter((f) => f.id !== id))
      } else {
        setUploads((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, status: "error", errorMessage } : f
          )
        )
      }
    }
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

  const cancelUpload = useCallback((id: string) => {
    setUploads((prev) => {
      const upload = prev.find((f) => f.id === id)
      if (upload?.abortController) {
        upload.abortController.abort()
      }
      return prev.filter((f) => f.id !== id)
    })
  }, [])

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
              Supports MP4, MKV, MOV, AVI, FLV up to 10 GB -- uploads directly to your streaming server
            </p>
          </div>
        </div>
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((file) => (
            <Card key={file.id} className="border-border bg-card">
              <CardContent className="flex items-center gap-4 p-4">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  file.status === "error" ? "bg-destructive/10" : "bg-secondary"
                )}>
                  {file.status === "error" ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Film className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <div className="flex items-center gap-2">
                      {file.status === "complete" ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : file.status === "error" ? (
                        <span className="text-xs text-destructive">{file.errorMessage || "Failed"}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {file.status === "saving" ? "Saving..." : `${file.progress}%`}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (file.status === "uploading") {
                            cancelUpload(file.id)
                          } else {
                            removeUpload(file.id)
                          }
                        }}
                      >
                        <X className="h-3 w-3" />
                        <span className="sr-only">{file.status === "uploading" ? "Cancel upload" : "Remove"}</span>
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{file.size}</p>
                  {file.status === "uploading" && (
                    <Progress value={file.progress} className="mt-2 h-1" />
                  )}
                  {file.status === "saving" && (
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
