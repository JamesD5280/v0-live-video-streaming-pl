import { createHmac } from "node:crypto"
import { extname } from "node:path"
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET

// Keep each uploaded chunk below the Vercel function request-body limit.

/**
 * POST /api/videos/upload/chunk
 * Receives a chunk of a file upload and forwards it to the streaming server.
 * The streaming server reassembles chunks into the final file.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!STREAMING_SERVER_URL || !STREAMING_API_SECRET) {
      return NextResponse.json({ error: "Streaming server not configured" }, { status: 503 })
    }

    const formData = await req.formData()
    const chunk = formData.get("chunk")
    const filename = formData.get("filename")
    const uploadId = formData.get("uploadId")
    const chunkIndex = formData.get("chunkIndex")
    const totalChunks = formData.get("totalChunks")
    const uploadPurpose = formData.get("uploadPurpose")
    const sequenceFps = Number(formData.get("sequenceFps"))
    const totalSize = Number(formData.get("totalSize"))

    if (
      !(chunk instanceof Blob) ||
      typeof filename !== "string" ||
      typeof uploadId !== "string" ||
      typeof chunkIndex !== "string" ||
      typeof totalChunks !== "string"
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    let streamingFilename = filename
    let streamingUploadId = uploadId
    if (uploadPurpose === "overlay" || uploadPurpose === "overlay-sequence") {
      const extension = extname(filename).slice(1).toLowerCase()
      const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)
      const isSequence = uploadPurpose === "overlay-sequence"
      if (!safeUploadId || (isSequence ? extension !== "zip" : !["mov", "mp4", "webm"].includes(extension))) {
        return NextResponse.json({ error: "Invalid overlay media upload" }, { status: 400 })
      }
      if (isSequence && (!Number.isInteger(sequenceFps) || sequenceFps < 1 || sequenceFps > 60 || !Number.isFinite(totalSize) || totalSize < 1 || totalSize > 512 * 1024 * 1024)) {
        return NextResponse.json({ error: "Invalid PNG sequence settings or ZIP size" }, { status: 400 })
      }
      streamingFilename = `overlay-${user.id}-${safeUploadId}.${extension}`
      streamingUploadId = `overlay-${user.id}-${safeUploadId}`
    }

    // Forward chunk to the streaming server
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer())

    const res = await fetch(`${STREAMING_SERVER_URL}/upload/chunk`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STREAMING_API_SECRET}`,
        "Content-Type": "application/octet-stream",
        "x-filename": streamingFilename,
        "x-upload-id": streamingUploadId,
        "x-chunk-index": chunkIndex,
        "x-total-chunks": totalChunks,
      },
      body: chunkBuffer,
    })

    if (!res.ok) {
      let errMsg = "Failed to upload chunk to streaming server"
      try {
        const data = await res.json()
        errMsg = data.error || errMsg
      } catch {}
      return NextResponse.json({ error: errMsg }, { status: res.status })
    }

    const data = await res.json()
    if (data.complete && data.path) {
      if (uploadPurpose === "overlay-sequence") {
        const convertResponse = await fetch(`${STREAMING_SERVER_URL}/overlays/png-sequence`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${STREAMING_API_SECRET}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ filename: data.filename, fps: sequenceFps }),
          signal: AbortSignal.timeout(5 * 60 * 1000),
        })
        if (!convertResponse.ok) {
          const convertError = await convertResponse.json().catch(() => ({}))
          return NextResponse.json({ error: convertError.error || "PNG sequence conversion failed" }, { status: convertResponse.status })
        }
        const converted = await convertResponse.json()
        data.filename = converted.filename
        data.serverPath = converted.path
        data.sequenceFrames = converted.frames
        data.sequenceFps = converted.fps
      } else {
        data.serverPath = data.path
      }

      if ((uploadPurpose === "overlay" || uploadPurpose === "overlay-sequence") && typeof data.filename === "string") {
        const filename = data.filename
        const supportedExtension = /\.(mov|mp4|webm)$/i.test(filename)
        const safeFilename = filename.startsWith(`overlay-${user.id}-`) && !/[\\/\u0000-\u001f\u007f]/.test(filename)
        if (supportedExtension && safeFilename) {
          const expires = String(Math.floor(Date.now() / 1000) + 2 * 60 * 60)
          const token = createHmac("sha256", STREAMING_API_SECRET)
            .update(`${user.id}:${filename}:${expires}`)
            .digest("hex")
          const previewParams = new URLSearchParams({ filename, expires, token })
          data.previewUrl = `/api/overlays/preview?${previewParams.toString()}`
        }
      }
    }
    return NextResponse.json(data)
  } catch (e) {
    console.error("Chunk upload error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    )
  }
}
