import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

/**
 * GET /api/videos/preview?filename=video.mp4
 * Proxies video streaming from the streaming server to the browser.
 * Supports Range requests for seeking in the video player.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const filename = searchParams.get("filename")
    if (!filename) return NextResponse.json({ error: "Missing filename" }, { status: 400 })

    if (!STREAMING_SERVER_URL) {
      return NextResponse.json({ error: "Streaming server not configured" }, { status: 500 })
    }

    // Forward Range header for seeking support
    const headers: Record<string, string> = {
      Authorization: `Bearer ${STREAMING_API_SECRET}`,
    }

    const rangeHeader = req.headers.get("range")
    if (rangeHeader) {
      headers["Range"] = rangeHeader
    }

    const serverRes = await fetch(
      `${STREAMING_SERVER_URL}/stream-video/${encodeURIComponent(filename)}`,
      { headers }
    )

    if (!serverRes.ok) {
      return NextResponse.json(
        { error: "Video not found on server" },
        { status: serverRes.status }
      )
    }

    // Forward the response with proper headers
    const responseHeaders = new Headers()
    const contentType = serverRes.headers.get("content-type") || "video/mp4"
    responseHeaders.set("Content-Type", contentType)
    responseHeaders.set("Accept-Ranges", "bytes")

    const contentLength = serverRes.headers.get("content-length")
    if (contentLength) responseHeaders.set("Content-Length", contentLength)

    const contentRange = serverRes.headers.get("content-range")
    if (contentRange) responseHeaders.set("Content-Range", contentRange)

    return new Response(serverRes.body, {
      status: serverRes.status,
      headers: responseHeaders,
    })
  } catch (e) {
    console.error("[v0] Video preview proxy error:", e)
    return NextResponse.json({ error: "Failed to stream video" }, { status: 500 })
  }
}
