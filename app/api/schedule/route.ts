import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("scheduled_events")
      .select("*, video:videos(*), event_destinations(*, destination:destinations(*)), event_overlays(*, overlay:overlays(*))")
      .order("scheduled_at", { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    const { data: event, error: eventError } = await supabase
      .from("scheduled_events")
      .insert({
        user_id: user.id,
        video_id: body.source_type === "rtmp_pull" ? null : body.video_id,
        title: body.title,
        scheduled_at: body.scheduled_at,
        repeat_mode: body.repeat_mode || "none",
        source_type: body.source_type || "video",
        rtmp_pull_url: body.source_type === "rtmp_pull" ? body.rtmp_pull_url : null,
      })
      .select()
      .single()

    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

    if (body.destination_ids && body.destination_ids.length > 0) {
      const destRows = body.destination_ids.map((destId: string) => ({
        event_id: event.id,
        destination_id: destId,
      }))

      const { error: destError } = await supabase
        .from("event_destinations")
        .insert(destRows)

      if (destError) return NextResponse.json({ error: destError.message }, { status: 500 })
    }

    // Save overlay associations
    if (body.overlay_ids && body.overlay_ids.length > 0) {
      const overlayRows = body.overlay_ids.map((overlayId: string) => ({
        event_id: event.id,
        overlay_id: overlayId,
      }))

      const { error: overlayError } = await supabase
        .from("event_overlays")
        .insert(overlayRows)

      if (overlayError) return NextResponse.json({ error: overlayError.message }, { status: 500 })
    }

    return NextResponse.json(event)
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    // Update the event
    const { error: eventError } = await supabase
      .from("scheduled_events")
      .update({
        video_id: updates.source_type === "rtmp_pull" ? null : updates.video_id,
        title: updates.title,
        scheduled_at: updates.scheduled_at,
        repeat_mode: updates.repeat_mode || "none",
        source_type: updates.source_type || "video",
        rtmp_pull_url: updates.source_type === "rtmp_pull" ? updates.rtmp_pull_url : null,
        status: "scheduled", // Reset status when editing
      })
      .eq("id", id)

    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

    // Update destinations: delete old ones and insert new ones
    await supabase.from("event_destinations").delete().eq("event_id", id)
    if (updates.destination_ids && updates.destination_ids.length > 0) {
      const destRows = updates.destination_ids.map((destId: string) => ({
        event_id: id,
        destination_id: destId,
      }))
      await supabase.from("event_destinations").insert(destRows)
    }

    // Update overlays: delete old ones and insert new ones
    await supabase.from("event_overlays").delete().eq("event_id", id)
    if (updates.overlay_ids && updates.overlay_ids.length > 0) {
      const overlayRows = updates.overlay_ids.map((overlayId: string) => ({
        event_id: id,
        overlay_id: overlayId,
      }))
      await supabase.from("event_overlays").insert(overlayRows)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const { error } = await supabase.from("scheduled_events").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
