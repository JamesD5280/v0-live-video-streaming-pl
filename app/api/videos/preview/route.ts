import { NextRequest, NextResponse } from "next/server"

/**
 * Edge Runtime streams large video files without body size limits.
 * No Node.js crypto needed -- we use Bearer token auth which the streaming server
 * accepts on /stream-video (global middleware skips this path).
 */
export const runtime = "edge"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

/**
 * GET /api/videos/preview?filename=video.mp4
 * 
 * Edge-based streaming proxy. Forwards Range requests for seeking.
 * Browser gets HTTPS, proxy fetches from HTTP streaming server.
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

    // Build the request headers -- Bearer auth for the streaming server
    const headers: Record<string, string> = {
      Authorization: `Bearer ${STREAMING_API_SECRET}`,
    }

    // Forward Range header for seeking support
    const rangeHeader = req.headers.get("range")
    if (rangeHeader) {
      headers["Range"] = rangeHeader
    }

    const serverUrl = `${STREAMING_SERVER_URL}/stream-video/${encodeURIComponent(filename)}`
    
    let serverRes: Response
    try {
      serverRes = await fetch(serverUrl, {
        headers,
        // @ts-expect-error -- Next.js edge specific cache option
        cache: "no-store",
      })
    } catch (fetchErr) {
      console.error("[v0] Video proxy fetch error:", fetchErr)
      return NextResponse.json(
        { error: "Cannot reach streaming server" },
        { status: 502 }
      )
    }

    if (!serverRes.ok && serverRes.status !== 206) {
      const errorBody = await serverRes.text().catch(() => "unknown")
      console.error("[v0] Video proxy server error:", serverRes.status, errorBody)
      return NextResponse.json(
        { error: `Video server error: ${serverRes.status}` },
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

    // Stream the body directly -- Edge Runtime has no body size limit
    return new Response(serverRes.body, {
      status: serverRes.status,
      headers: responseHeaders,
    })
  } catch {
    return NextResponse.json({ error: "Failed to stream video" }, { status: 502 })
  }
}
