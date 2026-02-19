import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("streams")
      .select("*, video:videos(*), playlist:playlists(*, playlist_items(*, video:videos(*))), stream_destinations(*, destination:destinations(*)), stream_overlays(*, overlay:overlays(*))")
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    console.error("Streams GET error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    // Always create as "pending" -- the engine route will set "live" after FFmpeg starts
    const { data: stream, error: streamError } = await supabase
      .from("streams")
      .insert({
        user_id: user.id,
        video_id: body.video_id || null,
        playlist_id: body.playlist_id || null,
        rtmp_pull_url: body.rtmp_pull_url || null,
        title: body.title,
        status: "pending",
      })
      .select()
      .single()

    if (streamError) return NextResponse.json({ error: streamError.message }, { status: 500 })

    // Insert stream destinations
    if (body.destination_ids?.length > 0) {
      const destRows = body.destination_ids.map((destId: string) => ({
        stream_id: stream.id,
        destination_id: destId,
        status: "pending",
      }))
      const { error: destError } = await supabase.from("stream_destinations").insert(destRows)
      if (destError) return NextResponse.json({ error: destError.message }, { status: 500 })
    }

    // Insert stream overlays
    if (body.overlay_ids?.length > 0) {
      const overlayRows = body.overlay_ids.map((overlayId: string) => ({
        stream_id: stream.id,
        overlay_id: overlayId,
      }))
      const { error: overlayError } = await supabase.from("stream_overlays").insert(overlayRows)
      if (overlayError) return NextResponse.json({ error: overlayError.message }, { status: 500 })
    }

    return NextResponse.json(stream)
  } catch (e) {
    console.error("Streams POST error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.status) {
      updates.status = body.status
      if (body.status === "live") updates.started_at = new Date().toISOString()
      if (body.status === "completed" || body.status === "stopped") updates.ended_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from("streams")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    console.error("Streams PATCH error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
