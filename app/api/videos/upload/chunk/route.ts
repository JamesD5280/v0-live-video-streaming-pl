import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

// Vercel serverless body limit is 4.5MB, our chunks are 4MB
export const config = {
  api: {
    bodyParser: false,
  },
}

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

    if (!STREAMING_SERVER_URL) {
      return NextResponse.json({ error: "Streaming server not configured" }, { status: 503 })
    }

    const formData = await req.formData()
    const chunk = formData.get("chunk") as Blob
    const filename = formData.get("filename") as string
    const uploadId = formData.get("uploadId") as string
    const chunkIndex = formData.get("chunkIndex") as string
    const totalChunks = formData.get("totalChunks") as string

    if (!chunk || !filename || !uploadId || chunkIndex === null || !totalChunks) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Forward chunk to the streaming server
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer())

    const res = await fetch(`${STREAMING_SERVER_URL}/upload/chunk`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STREAMING_API_SECRET}`,
        "Content-Type": "application/octet-stream",
        "x-filename": filename,
        "x-upload-id": uploadId,
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
    // Include serverPath for video overlay uploads
    if (data.complete && data.path) {
      data.serverPath = data.path
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
