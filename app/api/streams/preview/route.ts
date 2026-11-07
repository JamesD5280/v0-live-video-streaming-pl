import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const BUNNY_CDN_HOSTNAME = (
  process.env.BUNNY_CDN_HOSTNAME || `${process.env.BUNNY_STORAGE_ZONE || "2mstreamsn"}.b-cdn.net`
).replace(/^https?:\/\//i, "").split("/")[0].toLowerCase()

type PreviewVideo = { filename?: string | null; storage_path?: string | null }
type VideoSource = { path?: string; url?: string }
type VideoSourceResult = { source: VideoSource } | { error: string; status: number }

function getVideoSource(video: PreviewVideo): VideoSourceResult {
  const storagePath = video.storage_path

  if (storagePath?.startsWith("bunny://")) {
    return { error: "This video is still being assembled. Try again when processing finishes.", status: 409 }
  }

  if (/^https?:\/\//i.test(storagePath || "")) {
    let url: URL
    try {
      url = new URL(storagePath!)
    } catch {
      return { error: "The video storage URL is invalid.", status: 400 }
    }

    let supabaseHost = ""
    try {
      supabaseHost = SUPABASE_URL ? new URL(SUPABASE_URL).hostname.toLowerCase() : ""
    } catch {
      return { error: "Video storage is not configured correctly.", status: 503 }
    }

    const isBunnyVideo =
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.toLowerCase() === BUNNY_CDN_HOSTNAME &&
      url.pathname.startsWith("/videos/")
    const isSupabaseVideo =
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      Boolean(supabaseHost) &&
      url.hostname.toLowerCase() === supabaseHost &&
      url.pathname.startsWith("/storage/v1/object/public/videos/")

    if (!isBunnyVideo && !isSupabaseVideo) {
      return { error: "The video is not stored in an approved video location.", status: 400 }
    }

    return { source: { url: url.toString() } }
  }

  if (storagePath) {
    if (!SUPABASE_URL) {
      return { error: "Supabase video storage is not configured.", status: 503 }
    }

    try {
      const supabaseUrl = new URL(SUPABASE_URL)
      const pathSegments = storagePath.split("/").map(decodeURIComponent)
      if (pathSegments.some((segment) => segment === "." || segment === "..")) {
        return { error: "The video storage path is invalid.", status: 400 }
      }
      const encodedPath = pathSegments.map(encodeURIComponent).join("/")
      return {
        source: {
          url: new URL(`/storage/v1/object/public/videos/${encodedPath}`, supabaseUrl).toString(),
        },
      }
    } catch {
      return { error: "The video storage path is invalid.", status: 400 }
    }
  }

  if (!video.filename) {
    return { error: "The video file is not available.", status: 404 }
  }

  return { source: { path: video.filename } }
}

export const maxDuration = 60

/**
 * POST /api/streams/preview
 * Body: { videoId?, playlistId?, rtmpPullUrl?, overlayIds? }
 * Generates a 5-second preview clip with overlays applied.
 * Uses Node.js runtime with direct Supabase queries (no self-referencing fetch).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    if (!STREAMING_SERVER_URL || !STREAMING_API_SECRET) {
      return NextResponse.json({ error: "Streaming preview is not configured" }, { status: 503 })
    }

    if (![body.videoId, body.playlistId, body.rtmpPullUrl].filter(Boolean).length) {
      return NextResponse.json({ error: "Select a video, playlist, or RTMP source" }, { status: 400 })
    }

    let videoSource = ""
    let videoSources: { path?: string; url?: string }[] = []
    let isPlaylist = false

    if (body.rtmpPullUrl) {
      let sourceUrl: URL
      try {
        sourceUrl = new URL(body.rtmpPullUrl)
      } catch {
        return NextResponse.json({ error: "Enter a valid RTMP source URL" }, { status: 400 })
      }
      if (sourceUrl.protocol !== "rtmp:" && sourceUrl.protocol !== "rtmps:") {
        return NextResponse.json({ error: "RTMP sources must use rtmp:// or rtmps://" }, { status: 400 })
      }
      videoSource = body.rtmpPullUrl
      videoSources = [{ url: body.rtmpPullUrl }]
    } else if (body.videoId) {
      const { data: video } = await supabase
        .from("videos")
        .select("filename, storage_path")
        .eq("id", body.videoId)
        .single()
      if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 })

      const result = getVideoSource(video)
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
      videoSources = [result.source]
    } else if (body.playlistId) {
      const { data: playlist } = await supabase
        .from("playlists")
        .select("*, playlist_items(position, video:videos(filename, storage_path))")
        .eq("id", body.playlistId)
        .single()
      if (!playlist?.playlist_items?.length) {
        return NextResponse.json({ error: "Playlist has no videos" }, { status: 404 })
      }

      isPlaylist = true
      const orderedItems = playlist.playlist_items.sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position
      )
      for (const item of orderedItems) {
        if (!item.video) continue
        const result = getVideoSource(item.video)
        if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
        videoSources.push(result.source)
      }
      if (videoSources.length === 0) {
        return NextResponse.json({ error: "Playlist has no available videos" }, { status: 404 })
      }
    }

    // Fetch overlay data
    let overlays: Record<string, unknown>[] = []
    if (body.overlayIds?.length > 0) {
      const { data: overlayRows } = await supabase
        .from("overlays")
        .select("*")
        .in("id", body.overlayIds)
      if (overlayRows) {
        overlays = overlayRows.map((o) => ({
          id: o.id,
          type: o.type,
          imagePath: o.image_path || null,
          videoPath: o.video_path || null,
          loopOverlay: o.loop_overlay !== false,
          textContent: o.text_content || null,
          fontSize: o.font_size,
          fontColor: o.font_color,
          fontFamily: o.font_family,
          fontWeight: o.font_weight,
          bgColor: o.bg_color,
          position: o.position,
          positionX: o.position_x,
          positionY: o.position_y,
          sizePercent: o.size_percent,
          opacity: o.opacity,
          scrollSpeed: o.scroll_speed,
          scrollStartX: o.scroll_start_x,
          scrollEndX: o.scroll_end_x,
        }))
      }
    }

    // Call the streaming server's preview endpoint
    const serverRes = await fetch(`${STREAMING_SERVER_URL}/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${STREAMING_API_SECRET}`,
      },
      body: JSON.stringify({
        videoSource: videoSources[0]?.url || videoSource,
        videoSources,
        overlays,
        isPlaylist,
      }),
    })

    if (!serverRes.ok) {
      const errData = await serverRes.json().catch(() => ({ error: "Preview failed" }))
      return NextResponse.json(errData, { status: serverRes.status })
    }

    // Read the MP4 into a buffer and return it
    const buffer = Buffer.from(await serverRes.arrayBuffer())
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-cache",
      },
    })
  } catch (e) {
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 502 })
  }
}
