import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

/**
 * GET /api/videos/preview?filename=video.mp4
 * 
 * Server-side proxy that forwards Range requests for video seeking.
 * The browser requests HTTPS from Vercel, and this route fetches from the HTTP streaming server.
 * Uses a signed URL token for auth so /stream-video can skip the global auth middleware.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const filename = searchParams.get("filename")
    if (!filename) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 })
    }

    if (!STREAMING_SERVER_URL) {
      return NextResponse.json({ error: "Streaming server not configured" }, { status: 500 })
    }

    // Generate a signed token for the streaming server
    const expires = Date.now() + 3600 * 1000
    const payload = `${filename}:${expires}`
    const token = createHmac("sha256", STREAMING_API_SECRET)
      .update(payload)
      .digest("hex")

    // Build the request headers
    const headers: Record<string, string> = {}

    // Forward Range header for seeking support
    const rangeHeader = req.headers.get("range")
    if (rangeHeader) {
      headers["Range"] = rangeHeader
    }

    const serverUrl = `${STREAMING_SERVER_URL}/stream-video/${encodeURIComponent(filename)}?token=${token}&expires=${expires}`
    
    let serverRes: Response
    try {
      serverRes = await fetch(serverUrl, { headers })
    } catch (fetchErr) {
      return NextResponse.json(
        { error: "Cannot reach streaming server" },
        { status: 502 }
      )
    }

    if (!serverRes.ok && serverRes.status !== 206) {
      return NextResponse.json(
        { error: "Video not found or server error" },
        { status: serverRes.status }
      )
    }

    // Build response headers
    const responseHeaders = new Headers()
    const contentType = serverRes.headers.get("content-type") || "video/mp4"
    responseHeaders.set("Content-Type", contentType)
    responseHeaders.set("Accept-Ranges", "bytes")
    responseHeaders.set("Cache-Control", "public, max-age=3600")

    const contentLength = serverRes.headers.get("content-length")
    if (contentLength) responseHeaders.set("Content-Length", contentLength)

    const contentRange = serverRes.headers.get("content-range")
    if (contentRange) responseHeaders.set("Content-Range", contentRange)

    // Read into buffer and return (Node.js runtime, works up to ~50MB)
    const buffer = Buffer.from(await serverRes.arrayBuffer())
    return new Response(buffer, {
      status: serverRes.status,
      headers: responseHeaders,
    })
  } catch (e) {
    console.error("Video preview proxy error:", e)
    return NextResponse.json({ error: "Failed to stream video" }, { status: 502 })
  }
}
