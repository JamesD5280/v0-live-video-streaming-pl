import { NextRequest, NextResponse } from "next/server"
import http from "http"

/**
 * Node.js runtime -- required for proper HTTP piping with Range support.
 * Edge Runtime buffers responses and breaks video streaming.
 */
export const maxDuration = 60

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

/**
 * GET /api/videos/preview?filename=video.mp4
 *
 * Node.js-based video proxy that uses raw http.get to properly pipe
 * Range responses from the VPS streaming server to the browser.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const filename = searchParams.get("filename")
  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 })
  }

  if (!STREAMING_SERVER_URL) {
    return NextResponse.json({ error: "Streaming server not configured" }, { status: 500 })
  }

  const serverUrl = `${STREAMING_SERVER_URL}/stream-video/${encodeURIComponent(filename)}`

  // Build headers for the upstream request
  const upstreamHeaders: Record<string, string> = {
    Authorization: `Bearer ${STREAMING_API_SECRET}`,
  }
  const rangeHeader = req.headers.get("range")
  if (rangeHeader) {
    upstreamHeaders["Range"] = rangeHeader
  }

  // Use native http module for proper streaming
  return new Promise<Response>((resolve) => {
    const parsedUrl = new URL(serverUrl)
    
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: upstreamHeaders,
    }

    const proxyReq = http.request(options, (proxyRes) => {
      const responseHeaders = new Headers()
      
      // Forward relevant headers
      const ct = proxyRes.headers["content-type"] || "video/mp4"
      responseHeaders.set("Content-Type", ct)
      responseHeaders.set("Accept-Ranges", "bytes")
      responseHeaders.set("Cache-Control", "public, max-age=3600")
      responseHeaders.set("Access-Control-Allow-Origin", "*")

      if (proxyRes.headers["content-length"]) {
        responseHeaders.set("Content-Length", proxyRes.headers["content-length"])
      }
      if (proxyRes.headers["content-range"]) {
        responseHeaders.set("Content-Range", proxyRes.headers["content-range"])
      }

      // Convert Node.js readable stream to web ReadableStream
      const readable = new ReadableStream({
        start(controller) {
          proxyRes.on("data", (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk))
          })
          proxyRes.on("end", () => {
            controller.close()
          })
          proxyRes.on("error", (err) => {
            controller.error(err)
          })
        },
        cancel() {
          proxyRes.destroy()
        },
      })

      resolve(
        new Response(readable, {
          status: proxyRes.statusCode || 200,
          headers: responseHeaders,
        })
      )
    })

    proxyReq.on("error", () => {
      resolve(
        NextResponse.json(
          { error: "Cannot reach streaming server" },
          { status: 502 }
        )
      )
    })

    proxyReq.end()
  })
}

/** HEAD support for browser content-length discovery */
export async function HEAD(req: NextRequest) {
  return GET(req)
}
