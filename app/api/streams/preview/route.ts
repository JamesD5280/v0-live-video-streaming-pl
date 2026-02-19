import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * Use Edge Runtime to stream the preview MP4 back to the browser.
 */
export const runtime = "edge"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

/**
 * POST /api/streams/preview
 * Body: { videoId?, playlistId?, rtmpPullUrl?, overlayIds? }
 * Generates a 5-second preview clip with overlays applied.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!STREAMING_SERVER_URL) {
      return NextResponse.json({ error: "Streaming server not configured" }, { status: 500 })
    }

    // Build the video source info from the provided IDs
    // We'll need to look up actual paths from the DB
    // Since this is Edge Runtime, we use fetch to call our own API for DB lookups
    const baseUrl = req.nextUrl.origin

    let videoSource = ""
    let videoSources: { path?: string; url?: string }[] = []
    let isPlaylist = false

    if (body.rtmpPullUrl) {
      videoSource = body.rtmpPullUrl
      videoSources = [{ url: body.rtmpPullUrl }]
    } else if (body.videoId) {
      // Look up the video filename
      const videoRes = await fetch(`${baseUrl}/api/videos`, {
        headers: { cookie: req.headers.get("cookie") || "" },
      })
      const videos = await videoRes.json()
      const video = Array.isArray(videos) ? videos.find((v: { id: string }) => v.id === body.videoId) : null
      if (video) {
        videoSources = [{ path: video.filename }]
      }
    } else if (body.playlistId) {
      const plRes = await fetch(`${baseUrl}/api/playlists`, {
        headers: { cookie: req.headers.get("cookie") || "" },
      })
      const playlists = await plRes.json()
      const playlist = Array.isArray(playlists) ? playlists.find((p: { id: string }) => p.id === body.playlistId) : null
      if (playlist?.playlist_items) {
        isPlaylist = true
        videoSources = playlist.playlist_items
          .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
          .map((item: { video?: { filename?: string } }) => ({ path: item.video?.filename }))
          .filter((s: { path?: string }) => s.path)
      }
    }

    // Fetch overlay data if overlay IDs provided
    let overlays: Record<string, unknown>[] = []
    if (body.overlayIds?.length > 0) {
      const overlayRes = await fetch(`${baseUrl}/api/overlays`, {
        headers: { cookie: req.headers.get("cookie") || "" },
      })
      const allOverlays = await overlayRes.json()
      if (Array.isArray(allOverlays)) {
        overlays = allOverlays
          .filter((o: { id: string }) => body.overlayIds.includes(o.id))
          .map((o: {
            id: string; type: string; image_path?: string; video_path?: string;
            loop_overlay?: boolean; text_content?: string; font_size: number;
            font_color: string; bg_color: string; position: string;
            position_x?: number; position_y?: number; size_percent: number;
            opacity: number; scroll_speed?: number;
          }) => ({
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

    // Stream the MP4 back
    return new Response(serverRes.body, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "no-cache",
      },
    })
  } catch (e) {
    console.error("[v0] Preview error:", e)
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 502 })
  }
}
