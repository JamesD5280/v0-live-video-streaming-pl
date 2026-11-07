import { createHmac, timingSafeEqual } from "node:crypto"
import { basename, extname } from "node:path"
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET
const VIDEO_EXTENSIONS = new Set(["mov", "mp4", "webm"])

export const runtime = "nodejs"
export const maxDuration = 60

function isAllowedOverlayFilename(filename: string) {
  return (
    filename.length <= 255 &&
    filename.startsWith("overlay-") &&
    basename(filename) === filename &&
    !/[\\/\u0000-\u001f\u007f]/.test(filename) &&
    VIDEO_EXTENSIONS.has(extname(filename).slice(1).toLowerCase())
  )
}

function getFilenameFromStoredPath(videoPath: string) {
  const filename = basename(videoPath.replaceAll("\\", "/"))
  return isAllowedOverlayFilename(filename) ? filename : null
}

function isValidPreviewToken(userId: string, filename: string, expires: string, token: string) {
  if (!STREAMING_API_SECRET || !/^[a-f0-9]{64}$/i.test(token)) return false

  const expiresAt = Number(expires)
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 24 * 60 * 60) {
    return false
  }

  const expected = createHmac("sha256", STREAMING_API_SECRET)
    .update(`${userId}:${filename}:${expires}`)
    .digest()
  const provided = Buffer.from(token, "hex")
  return provided.length === expected.length && timingSafeEqual(expected, provided)
}

async function proxyOverlayVideo(req: NextRequest, method: "GET" | "HEAD") {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const signedFilename = searchParams.get("filename")
  let filename: string | null = null

  if (signedFilename) {
    const expires = searchParams.get("expires") || ""
    const token = searchParams.get("token") || ""
    if (
      !isAllowedOverlayFilename(signedFilename) ||
      !isValidPreviewToken(user.id, signedFilename, expires, token)
    ) {
      return NextResponse.json({ error: "Invalid or expired overlay preview link" }, { status: 403 })
    }
    filename = signedFilename
  } else {
    const overlayId = searchParams.get("overlayId")
    if (!overlayId) return NextResponse.json({ error: "Missing overlayId" }, { status: 400 })

    const { data: overlay, error } = await supabase
      .from("overlays")
      .select("type, video_path")
      .eq("id", overlayId)
      .maybeSingle()

    if (error || !overlay || overlay.type !== "video" || !overlay.video_path) {
      return NextResponse.json({ error: "Video overlay not found" }, { status: 404 })
    }

    filename = getFilenameFromStoredPath(overlay.video_path)
    if (!filename) return NextResponse.json({ error: "Invalid video overlay file" }, { status: 404 })
  }

  if (!STREAMING_SERVER_URL || !STREAMING_API_SECRET) {
    return NextResponse.json({ error: "Video overlay preview is not configured" }, { status: 503 })
  }

  let upstreamUrl: URL
  try {
    upstreamUrl = new URL(`/stream-video/${encodeURIComponent(filename)}`, STREAMING_SERVER_URL)
  } catch {
    return NextResponse.json({ error: "Invalid streaming server URL" }, { status: 500 })
  }

  if (upstreamUrl.protocol !== "http:" && upstreamUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported streaming server protocol" }, { status: 500 })
  }

  const upstreamHeaders = new Headers({ Authorization: `Bearer ${STREAMING_API_SECRET}` })
  const range = req.headers.get("range")
  const ifRange = req.headers.get("if-range")
  if (range) upstreamHeaders.set("Range", range)
  if (ifRange) upstreamHeaders.set("If-Range", ifRange)

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      cache: "no-store",
      redirect: "manual",
    })

    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel()
      return NextResponse.json({ error: "Streaming server returned an unexpected redirect" }, { status: 502 })
    }

    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Vary": "Cookie, Range",
      "X-Content-Type-Options": "nosniff",
    })
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    if (!headers.has("content-type")) headers.set("Content-Type", "video/mp4")
    if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes")

    return new Response(method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch {
    return NextResponse.json({ error: "Cannot reach streaming server" }, { status: 502 })
  }
}

export async function GET(req: NextRequest) {
  return proxyOverlayVideo(req, "GET")
}

export async function HEAD(req: NextRequest) {
  return proxyOverlayVideo(req, "HEAD")
}
