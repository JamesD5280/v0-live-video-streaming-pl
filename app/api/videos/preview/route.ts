import { NextRequest, NextResponse } from "next/server"

/**
 * Use Edge Runtime to stream large video files without the 4.5MB serverless body limit.
 * This proxies the video from the HTTP streaming server through HTTPS Vercel,
 * solving the mixed-content browser block.
 */
export const runtime = "edge"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

/**
 * GET /api/videos/preview?filename=video.mp4
 * 
 * Edge-based streaming proxy that forwards Range requests for seeking.
 * The browser gets video from HTTPS, the proxy fetches from HTTP streaming server.
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

    // Build the request to the streaming server
    const headers: Record<string, string> = {
      Authorization: `Bearer ${STREAMING_API_SECRET}`,
    }

    // Forward Range header for seeking support
    const rangeHeader = req.headers.get("range")
    if (rangeHeader) {
      headers["Range"] = rangeHeader
    }

    const serverUrl = `${STREAMING_SERVER_URL}/stream-video/${encodeURIComponent(filename)}`
    console.log("[v0] Preview proxy fetching:", serverUrl)
    
    let serverRes: Response
    try {
      serverRes = await fetch(serverUrl, { headers })
    } catch (fetchErr) {
      console.error("[v0] Preview proxy fetch failed:", fetchErr)
      return NextResponse.json(
        { error: "Cannot reach streaming server", detail: String(fetchErr) },
        { status: 502 }
      )
    }

    console.log("[v0] Preview proxy response:", serverRes.status, "content-type:", serverRes.headers.get("content-type"))

    if (!serverRes.ok && serverRes.status !== 206) {
      const errText = await serverRes.text().catch(() => "")
      console.error("[v0] Preview proxy server error:", serverRes.status, errText)
      return NextResponse.json(
        { error: "Video not found or server error", detail: errText },
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

    // Stream the response body through (Edge Runtime has no body size limit)
    return new Response(serverRes.body, {
      status: serverRes.status,
      headers: responseHeaders,
    })
  } catch (e) {
    console.error("[v0] Video preview proxy error:", e)
    return NextResponse.json({ error: "Failed to stream video" }, { status: 502 })
  }
}
