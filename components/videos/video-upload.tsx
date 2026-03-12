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
      // Upload via our own API proxy (avoids CORS and mixed-content issues)
      // Uses chunked upload to work within Vercel's limits
      const CHUNK_SIZE = 4 * 1024 * 1024 // 4 MB chunks
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
      const uploadId = id

      for (let i = 0; i < totalChunks; i++) {
        if (abortController.signal.aborted) {
          throw new Error("Upload cancelled")
        }

        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const chunk = file.slice(start, end)

        const formData = new FormData()
        formData.append("chunk", chunk)
        formData.append("filename", file.name)
        formData.append("uploadId", uploadId)
        formData.append("chunkIndex", String(i))
        formData.append("totalChunks", String(totalChunks))

        const chunkRes = await fetch("/api/videos/upload-bunny", {
          method: "POST",
          body: formData,
          signal: abortController.signal,
        })

        if (!chunkRes.ok) {
          let errMsg = "Upload failed"
          try {
            const resp = await chunkRes.json()
            errMsg = resp.error || errMsg
          } catch {}
          throw new Error(errMsg)
        }

        const overallProgress = Math.round(((i + 1) / totalChunks) * 100)
        setUploads((prev) =>
          prev.map((f) => (f.id === id ? { ...f, progress: overallProgress } : f))
        )
      }

      // Step 3: Finalize upload and save metadata to database
      setUploads((prev) =>
        prev.map((f) => (f.id === id ? { ...f, progress: 100, status: "saving" } : f))
      )

      const format = file.name.split(".").pop()?.toUpperCase() || "MP4"
      const finalRes = await fetch("/api/videos/upload-bunny", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: id,
          filename: file.name,
          title: file.name.replace(/\.[^/.]+$/, ""),
          file_size: file.size,
          format,
          totalChunks, // Required for chunk assembly
        }),
      })

      if (!finalRes.ok) {
        const err = await finalRes.json()
        throw new Error(err.error || "Failed to finalize upload")
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
              Supports MP4, MKV, MOV, AVI, FLV up to 10 GB -- uploads directly to Bunny CDN storage
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
