import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import http from "http"
import https from "https"

/**
 * Node.js runtime -- required for proper HTTP piping with Range support.
 * Edge Runtime buffers responses and breaks video streaming.
 */
export const maxDuration = 60

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET
const BUNNY_CDN_HOSTNAME = (
  process.env.BUNNY_CDN_HOSTNAME || `${process.env.BUNNY_STORAGE_ZONE || "2mstreamsn"}.b-cdn.net`
).replace(/^https?:\/\//i, "").split("/")[0].toLowerCase()

export const runtime = "nodejs"

/**
 * GET /api/videos/preview?videoId=<owned-video-id>
 * Streams completed Bunny uploads from their CDN URL and legacy uploads from
 * the VPS file store, preserving byte ranges for browser seeking.
 */
async function proxyVideoPreview(req: NextRequest, method: "GET" | "HEAD") {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const videoId = searchParams.get("videoId")
  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 })
  }

  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("filename, storage_path")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (videoError || !video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 })
  }

  const rangeHeader = req.headers.get("range")
  const ifRangeHeader = req.headers.get("if-range")
  const responseHeaders = new Headers()
  responseHeaders.set("Cache-Control", "private, no-store")
  responseHeaders.set("Vary", "Cookie, Range")
  responseHeaders.set("X-Content-Type-Options", "nosniff")

  if (video.storage_path?.startsWith("bunny://")) {
    return NextResponse.json({ error: "Video is still being assembled" }, { status: 409 })
  }

  if (/^https?:\/\//i.test(video.storage_path || "")) {
    let cdnUrl: URL
    try {
      cdnUrl = new URL(video.storage_path!)
    } catch {
      return NextResponse.json({ error: "Invalid video storage URL" }, { status: 500 })
    }

    if (
      cdnUrl.protocol !== "https:" ||
      cdnUrl.hostname.toLowerCase() !== BUNNY_CDN_HOSTNAME ||
      !cdnUrl.pathname.startsWith("/videos/") ||
      cdnUrl.username ||
      cdnUrl.password
    ) {
      return NextResponse.json({ error: "Video storage URL is not an approved CDN URL" }, { status: 502 })
    }

    const upstreamHeaders = new Headers()
    if (rangeHeader) upstreamHeaders.set("Range", rangeHeader)
    if (ifRangeHeader) upstreamHeaders.set("If-Range", ifRangeHeader)

    try {
      const upstream = await fetch(cdnUrl, {
        method,
        headers: upstreamHeaders,
        cache: "no-store",
        redirect: "manual",
      })

      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel()
        return NextResponse.json({ error: "Video CDN returned an unexpected redirect" }, { status: 502 })
      }

      for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
        const value = upstream.headers.get(name)
        if (value) responseHeaders.set(name, value)
      }
      if (!responseHeaders.has("content-type")) responseHeaders.set("Content-Type", "video/mp4")
      if (!responseHeaders.has("accept-ranges")) responseHeaders.set("Accept-Ranges", "bytes")

      return new Response(method === "HEAD" ? null : upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      })
    } catch {
      return NextResponse.json({ error: "Cannot reach video CDN" }, { status: 502 })
    }
  }

  if (!STREAMING_SERVER_URL || !STREAMING_API_SECRET) {
    return NextResponse.json({ error: "Streaming preview is not configured" }, { status: 503 })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(`/stream-video/${encodeURIComponent(video.filename)}`, STREAMING_SERVER_URL)
  } catch {
    return NextResponse.json({ error: "Invalid streaming server URL" }, { status: 500 })
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported streaming server protocol" }, { status: 500 })
  }

  const upstreamHeaders: Record<string, string> = {
    Authorization: `Bearer ${STREAMING_API_SECRET}`,
  }
  if (rangeHeader) upstreamHeaders.Range = rangeHeader
  if (ifRangeHeader) upstreamHeaders["If-Range"] = ifRangeHeader

  return new Promise<Response>((resolve) => {
    const transport = parsedUrl.protocol === "https:" ? https : http
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: upstreamHeaders,
    }

    const proxyReq = transport.request(options, (proxyRes) => {
      const headers = new Headers(responseHeaders)
      const contentType = proxyRes.headers["content-type"] || "video/mp4"
      headers.set("Content-Type", String(contentType))
      headers.set("Accept-Ranges", String(proxyRes.headers["accept-ranges"] || "bytes"))

      if (proxyRes.headers["content-length"]) {
        headers.set("Content-Length", proxyRes.headers["content-length"])
      }
      if (proxyRes.headers["content-range"]) {
        headers.set("Content-Range", proxyRes.headers["content-range"])
      }

      if (method === "HEAD") {
        proxyRes.destroy()
        resolve(new Response(null, { status: proxyRes.statusCode || 200, headers }))
        return
      }

      const readable = new ReadableStream({
        start(controller) {
          proxyRes.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
          proxyRes.on("end", () => controller.close())
          proxyRes.on("error", (err) => controller.error(err))
        },
        cancel() {
          proxyRes.destroy()
        },
      })

      resolve(new Response(readable, { status: proxyRes.statusCode || 200, headers }))
    })

    proxyReq.setTimeout(20_000, () => proxyReq.destroy(new Error("Preview request timed out")))
    proxyReq.on("error", () => {
      resolve(NextResponse.json({ error: "Cannot reach streaming server" }, { status: 502 }))
    })
    proxyReq.end()
  })
}

export async function GET(req: NextRequest) {
  return proxyVideoPreview(req, "GET")
}

export async function HEAD(req: NextRequest) {
  return proxyVideoPreview(req, "HEAD")
}
