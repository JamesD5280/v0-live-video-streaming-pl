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

      // Determine video source(s) or RTMP pull URL
      const supabaseStorageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`
      let videoSources: { url?: string; path?: string; title?: string }[] = []
      let loop = true
      const isRtmpPull = !!stream.rtmp_pull_url

      if (isRtmpPull) {
        // RTMP Pull mode: no video files needed, stream from RTMP URL
        videoSources = [{
          url: stream.rtmp_pull_url,
          title: "RTMP Pull Source",
        }]
        loop = false // RTMP pull is live, no looping
      } else if (stream.playlist) {
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
          video_path?: string;
          loop_overlay?: boolean;
          text_content?: string;
          font_size: number;
          font_color: string;
          bg_color: string;
          position: string;
          position_x?: number;
          position_y?: number;
          size_percent: number;
          opacity: number;
          scroll_speed?: number;
        }}) => ({
          id: so.overlay.id,
          type: so.overlay.type,
          imagePath: so.overlay.image_path || null,
          videoPath: so.overlay.video_path || null,
          loopOverlay: so.overlay.loop_overlay !== false,
          textContent: so.overlay.text_content || null,
          fontSize: so.overlay.font_size,
          fontColor: so.overlay.font_color,
          bgColor: so.overlay.bg_color,
          position: so.overlay.position,
          positionX: so.overlay.position_x ?? undefined,
          positionY: so.overlay.position_y ?? undefined,
          sizePercent: so.overlay.size_percent,
          opacity: so.overlay.opacity,
          scrollSpeed: so.overlay.scroll_speed ?? undefined,
        }))

      let result
      try {
        result = await callStreamingServer("/start", {
          streamId: stream.id,
          videoSources,
          // Backward compat: also send single video fields
          videoUrl: videoSources[0]?.url,
          videoPath: videoSources[0]?.path,
          destinations,
          overlays,
          loop,
          isPlaylist: !!stream.playlist,
          isRtmpPull,
          rtmpPullUrl: stream.rtmp_pull_url || null,
        })
      } catch (engineErr) {
        // Mark stream as error since engine couldn't start
        await supabase
          .from("streams")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", streamId)
        await supabase
          .from("stream_destinations")
          .update({ status: "error" })
          .eq("stream_id", streamId)
        return NextResponse.json({
          success: false,
          error: "Failed to reach streaming engine",
          detail: engineErr instanceof Error ? engineErr.message : String(engineErr),
        }, { status: 502 })
      }

      if (result?.error) {
        await supabase
          .from("streams")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", streamId)
        await supabase
          .from("stream_destinations")
          .update({ status: "error" })
          .eq("stream_id", streamId)
        return NextResponse.json({ success: false, error: result.error }, { status: 400 })
      }

      // Wait briefly then verify the engine is actually running the stream
      await new Promise((resolve) => setTimeout(resolve, 2000))

      let engineRunning = false
      try {
        const healthRes = await fetch(`${STREAMING_SERVER_URL}/health`, {
          headers: { Authorization: `Bearer ${STREAMING_API_SECRET}` },
          signal: AbortSignal.timeout(5000),
        })
        const health = await healthRes.json()
        // Check if the engine reports any active streams or this specific stream
        const activeStreams = health.activeStreams || health.active_streams || 0
        const activeIds = health.streamIds || health.active_ids || []
        engineRunning = activeStreams > 0 || activeIds.includes(streamId)
      } catch {
        // Health check failed -- might be temporarily busy starting
        engineRunning = false
      }

      if (!engineRunning) {
        // Engine accepted the command but FFmpeg likely failed (e.g. no video file)
        await supabase
          .from("streams")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", streamId)
        await supabase
          .from("stream_destinations")
          .update({ status: "error" })
          .eq("stream_id", streamId)
        return NextResponse.json({
          success: false,
          error: "Stream engine accepted the command but FFmpeg did not start. The video file may not exist on the server. Upload videos to the server first.",
        }, { status: 400 })
      }

      // Verified: engine is running the stream
      await supabase
        .from("streams")
        .update({ status: "live", started_at: new Date().toISOString() })
        .eq("id", streamId)

      await supabase
        .from("stream_destinations")
        .update({ status: "connected" })
        .eq("stream_id", streamId)

      return NextResponse.json({ success: true, engine: result })
    }

    if (action === "update_overlays") {
      // Live overlay update: restart FFmpeg with new overlay config
      const { overlayIds } = body
      if (!streamId) return NextResponse.json({ error: "Missing streamId" }, { status: 400 })

      // Fetch the selected overlays
      let overlays: {
        id: string;
        type: string;
        imagePath: string | null;
        videoPath: string | null;
        loopOverlay: boolean;
        textContent: string | null;
        fontSize: number;
        fontColor: string;
        bgColor: string;
        position: string;
        positionX?: number;
        positionY?: number;
        sizePercent: number;
        opacity: number;
      }[] = []

      if (overlayIds && overlayIds.length > 0) {
        const { data: overlayRows } = await supabase
          .from("overlays")
          .select("*")
          .in("id", overlayIds)

        overlays = (overlayRows || []).map((o: {
          id: string;
          type: string;
          image_path?: string;
          video_path?: string;
          loop_overlay?: boolean;
          text_content?: string;
          font_size: number;
          font_color: string;
          bg_color: string;
          position: string;
          position_x?: number;
          position_y?: number;
          size_percent: number;
          opacity: number;
          scroll_speed?: number;
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
          positionX: o.position_x ?? undefined,
          positionY: o.position_y ?? undefined,
          sizePercent: o.size_percent,
          opacity: o.opacity,
          scrollSpeed: o.scroll_speed ?? undefined,
        }))
      }

      // Call the streaming server's /restart endpoint
      try {
        const result = await callStreamingServer("/restart", { streamId, overlays })
        if (result?.error) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 })
        }

        // Update the stream_overlays join table in DB
        // Remove old overlay associations
        await supabase.from("stream_overlays").delete().eq("stream_id", streamId)
        // Insert new ones
        if (overlayIds && overlayIds.length > 0) {
          const rows = overlayIds.map((oid: string) => ({ stream_id: streamId, overlay_id: oid }))
          await supabase.from("stream_overlays").insert(rows)
        }

        return NextResponse.json({ success: true, overlayCount: overlays.length, restarted: true })
      } catch (err) {
        return NextResponse.json({
          success: false,
          error: "Failed to reach streaming engine for overlay update",
          detail: err instanceof Error ? err.message : String(err),
        }, { status: 502 })
      }
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
        return NextResponse.json({ configured: false })
      }
      try {
        const res = await fetch(`${STREAMING_SERVER_URL}/health`, {
          headers: { Authorization: `Bearer ${STREAMING_API_SECRET}` },
          signal: AbortSignal.timeout(5000),
        })
        const health = await res.json()
        return NextResponse.json({ configured: true, ...health })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ 
          configured: true, 
          status: "offline", 
          errorDetail: errorMsg,
          serverUrl: STREAMING_SERVER_URL?.replace(/\/\/(.+?)@/, '//**@')
        })
      }
    }

    if (action === "test_videos") {
      // Diagnostic: test if the VPS has a working /videos endpoint
      if (!STREAMING_SERVER_URL) {
        return NextResponse.json({ error: "Streaming server not configured" })
      }
      try {
        const res = await fetch(`${STREAMING_SERVER_URL}/videos`, {
          headers: { Authorization: `Bearer ${STREAMING_API_SECRET}` },
          signal: AbortSignal.timeout(5000),
        })
        const contentType = res.headers.get("content-type") || ""
        const text = await res.text()
        
        // Check if we got HTML back (means the VPS file is corrupted)
        if (text.includes("<!DOCTYPE") || text.includes("<html")) {
          return NextResponse.json({
            error: "VPS streaming-server.js is corrupted (returning HTML instead of JSON). You need to re-download the correct file.",
            isHtml: true,
            contentType,
            bodyPreview: text.slice(0, 200),
          })
        }
        
        try {
          const data = JSON.parse(text)
          return NextResponse.json({ success: true, ...data })
        } catch {
          return NextResponse.json({
            error: "VPS returned non-JSON response",
            contentType,
            bodyPreview: text.slice(0, 200),
          })
        }
      } catch (err) {
        return NextResponse.json({
          error: "Failed to reach VPS /videos endpoint",
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (e) {
    console.error("Engine route error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
