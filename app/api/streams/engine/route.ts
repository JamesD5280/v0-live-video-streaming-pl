import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

async function callStreamingServer(path: string, body: Record<string, unknown>) {
  if (!STREAMING_SERVER_URL) {
    return { error: "Streaming server not configured" }
  }
  const res = await fetch(`${STREAMING_SERVER_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${STREAMING_API_SECRET}`,
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

/**
 * POST /api/streams/engine
 * Actions: "start" | "stop" | "status"
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { action, streamId } = body

    if (action === "start") {
      // Fetch stream with video, playlist, destinations, and overlays
      const { data: stream, error: streamError } = await supabase
        .from("streams")
        .select("*, video:videos(*), playlist:playlists(*, playlist_items(*, video:videos(*))), stream_destinations(*, destination:destinations(*)), stream_overlays(*, overlay:overlays(*))")
        .eq("id", streamId)
        .single()

      if (streamError || !stream) {
        return NextResponse.json({ error: "Stream not found" }, { status: 404 })
      }

      // Build destination list
      const destinations = (stream.stream_destinations || [])
        .map((sd: { destination: { id: string; rtmp_url: string; stream_key: string; name: string } | null }) => {
          if (!sd.destination) return null
          return {
            id: sd.destination.id,
            name: sd.destination.name,
            rtmpUrl: sd.destination.rtmp_url,
            streamKey: sd.destination.stream_key,
          }
        })
        .filter(Boolean)

      if (destinations.length === 0) {
        return NextResponse.json({ error: "No destinations configured" }, { status: 400 })
      }

      // Determine video source(s)
      const supabaseStorageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`
      let videoSources: { url?: string; path?: string; title?: string }[] = []
      let loop = true

      if (stream.playlist) {
        // Playlist mode: multiple videos in order
        const items = (stream.playlist.playlist_items || [])
          .sort((a: { position: number }, b: { position: number }) => a.position - b.position)

        videoSources = items
          .filter((item: { video: unknown }) => item.video)
          .map((item: { video: { storage_path?: string; filename?: string; title?: string } }) => ({
            url: item.video.storage_path
              ? `${supabaseStorageBase}/videos/${item.video.storage_path}`
              : undefined,
            path: item.video.filename,
            title: item.video.title,
          }))

        loop = stream.playlist.loop !== false
      } else if (stream.video) {
        // Single video mode
        videoSources = [{
          url: stream.video.storage_path
            ? `${supabaseStorageBase}/videos/${stream.video.storage_path}`
            : undefined,
          path: stream.video.filename,
          title: stream.video.title,
        }]
      }

      if (videoSources.length === 0) {
        return NextResponse.json({ error: "No video sources found" }, { status: 400 })
      }

      // Build overlay list
      const overlays = (stream.stream_overlays || [])
        .filter((so: { overlay: unknown }) => so.overlay)
        .map((so: { overlay: {
          id: string;
          type: string;
          image_path?: string;
          text_content?: string;
          font_size: number;
          font_color: string;
          bg_color: string;
          position: string;
          size_percent: number;
          opacity: number;
        }}) => ({
          id: so.overlay.id,
          type: so.overlay.type,
          imagePath: so.overlay.image_path || null,
          textContent: so.overlay.text_content || null,
          fontSize: so.overlay.font_size,
          fontColor: so.overlay.font_color,
          bgColor: so.overlay.bg_color,
          position: so.overlay.position,
          sizePercent: so.overlay.size_percent,
          opacity: so.overlay.opacity,
        }))

      const result = await callStreamingServer("/start", {
        streamId: stream.id,
        videoSources,
        // Backward compat: also send single video fields
        videoUrl: videoSources[0]?.url,
        videoPath: videoSources[0]?.path,
        destinations,
        overlays,
        loop,
        isPlaylist: !!stream.playlist,
      })

      // Update stream status to live
      await supabase
        .from("streams")
        .update({ status: "live", started_at: new Date().toISOString() })
        .eq("id", streamId)

      // Update destination statuses
      await supabase
        .from("stream_destinations")
        .update({ status: "connected" })
        .eq("stream_id", streamId)

      return NextResponse.json({ success: true, engine: result })
    }

    if (action === "stop") {
      const result = await callStreamingServer("/stop", { streamId })

      // Update stream status
      await supabase
        .from("streams")
        .update({ status: "stopped", ended_at: new Date().toISOString() })
        .eq("id", streamId)

      // Update destination statuses
      await supabase
        .from("stream_destinations")
        .update({ status: "disconnected" })
        .eq("stream_id", streamId)

      return NextResponse.json({ success: true, engine: result })
    }

    if (action === "status") {
      if (!STREAMING_SERVER_URL) {
        console.log("[v0] Engine status: STREAMING_SERVER_URL is not set")
        return NextResponse.json({ configured: false })
      }
      try {
        console.log("[v0] Engine status: checking", `${STREAMING_SERVER_URL}/health`)
        const res = await fetch(`${STREAMING_SERVER_URL}/health`, {
          headers: { Authorization: `Bearer ${STREAMING_API_SECRET}` },
          signal: AbortSignal.timeout(5000),
        })
        console.log("[v0] Engine status: response status", res.status)
        const health = await res.json()
        console.log("[v0] Engine status: health response", JSON.stringify(health))
        return NextResponse.json({ configured: true, ...health })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.log("[v0] Engine status: failed to reach server", errorMsg)
        return NextResponse.json({ 
          configured: true, 
          status: "offline", 
          errorDetail: errorMsg,
          serverUrl: STREAMING_SERVER_URL?.replace(/\/\/(.+?)@/, '//**@') // mask credentials if any
        })
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (e) {
    console.error("Engine route error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
