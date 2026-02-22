import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

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

    if (!STREAMING_SERVER_URL) {
      return NextResponse.json({ error: "Streaming server not configured" }, { status: 500 })
    }

    let videoSource = ""
    let videoSources: { path?: string; url?: string }[] = []
    let isPlaylist = false

    if (body.rtmpPullUrl) {
      videoSource = body.rtmpPullUrl
      videoSources = [{ url: body.rtmpPullUrl }]
    } else if (body.videoId) {
      const { data: video } = await supabase
        .from("videos")
        .select("filename")
        .eq("id", body.videoId)
        .single()
      if (video) {
        videoSources = [{ path: video.filename }]
      }
    } else if (body.playlistId) {
      const { data: playlist } = await supabase
        .from("playlists")
        .select("*, playlist_items(*, video:videos(filename))")
        .eq("id", body.playlistId)
        .single()
      if (playlist?.playlist_items) {
        isPlaylist = true
        videoSources = playlist.playlist_items
          .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
          .map((item: { video?: { filename?: string } }) => ({ path: item.video?.filename }))
          .filter((s: { path?: string }) => s.path)
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
          bgColor: o.bg_color,
          position: o.position,
          positionX: o.position_x,
          positionY: o.position_y,
          sizePercent: o.size_percent,
          opacity: o.opacity,
          scrollSpeed: o.scroll_speed,
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
        videoSource,
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
