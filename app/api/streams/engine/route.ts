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
      // Fetch stream with video and destination details
      const { data: stream, error: streamError } = await supabase
        .from("streams")
        .select("*, video:videos(*), stream_destinations(*, destination:destinations(*))")
        .eq("id", streamId)
        .single()

      if (streamError || !stream) {
        return NextResponse.json({ error: "Stream not found" }, { status: 404 })
      }

      // Build destination list for the streaming server
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

      // Determine video source - use storage_path if available, or construct from Supabase storage
      const videoSource = stream.video?.storage_path
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/videos/${stream.video.storage_path}`
        : null

      const result = await callStreamingServer("/start", {
        streamId: stream.id,
        videoUrl: videoSource,
        videoPath: stream.video?.filename, // Fallback to local file on server
        destinations,
        loop: true,
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
        return NextResponse.json({ configured: false })
      }
      try {
        const res = await fetch(`${STREAMING_SERVER_URL}/health`, {
          headers: { Authorization: `Bearer ${STREAMING_API_SECRET}` },
        })
        const health = await res.json()
        return NextResponse.json({ configured: true, ...health })
      } catch {
        return NextResponse.json({ configured: true, status: "offline" })
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (e) {
    console.error("[v0] Engine route error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
