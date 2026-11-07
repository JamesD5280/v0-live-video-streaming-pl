import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

function parseFutureScheduleTime(value: unknown): string | null {
  if (typeof value !== "string") return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return null
  return new Date(timestamp).toISOString()
}

function isValidRtmpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return url.protocol === "rtmp:" || url.protocol === "rtmps:"
  } catch {
    return false
  }
}

type ScheduleSourceType = "video" | "playlist" | "rtmp_pull"

type PlaylistValidation =
  | { ok: true; playlistId: string }
  | { ok: false; error: string; status: 400 | 500 }

function parseScheduleSourceType(value: unknown): ScheduleSourceType | null {
  if (value === undefined || value === "video") return "video"
  if (value === "playlist" || value === "rtmp_pull") return value
  return null
}

async function validatePlaylistSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  value: unknown,
): Promise<PlaylistValidation> {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "Select a playlist source", status: 400 }
  }

  const { data, error } = await supabase
    .from("playlists")
    .select("id, playlist_items(video:videos(status))")
    .eq("id", value)
    .maybeSingle()

  if (error) return { ok: false, error: "Failed to validate the selected playlist", status: 500 }
  if (!data) return { ok: false, error: "Playlist not found or unavailable", status: 400 }

  const items = data.playlist_items || []
  if (items.length === 0) {
    return { ok: false, error: "Choose a playlist that contains at least one video", status: 400 }
  }
  if (items.some((item: { video?: { status?: string } | { status?: string }[] | null }) => {
    const video = Array.isArray(item.video) ? item.video[0] : item.video
    return video?.status !== "ready"
  })) {
    return { ok: false, error: "All videos in the playlist must be ready before scheduling", status: 400 }
  }

  return { ok: true, playlistId: data.id }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("scheduled_events")
      .select("*, video:videos(*), playlist:playlists(*, playlist_items(*, video:videos(*))), event_destinations(*, destination:destinations(*)), event_overlays(*, overlay:overlays(*))")
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
    const scheduledAt = parseFutureScheduleTime(body?.scheduled_at)
    const sourceType = parseScheduleSourceType(body?.source_type)
    const repeatMode = body?.repeat_mode || "none"
    if (!sourceType) return NextResponse.json({ error: "Invalid source type" }, { status: 400 })

    let playlistId: string | null = null
    if (sourceType === "playlist") {
      const playlistValidation = await validatePlaylistSource(supabase, body?.playlist_id)
      if (!playlistValidation.ok) {
        return NextResponse.json({ error: playlistValidation.error }, { status: playlistValidation.status })
      }
      playlistId = playlistValidation.playlistId
    }
    const destinationIds = Array.isArray(body?.destination_ids) ? body.destination_ids : []
    const overlayIds = Array.isArray(body?.overlay_ids) ? body.overlay_ids : []

    if (typeof body?.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "A stream title is required" }, { status: 400 })
    }
    if (!scheduledAt) {
      return NextResponse.json({ error: "scheduled_at must be a valid future timestamp" }, { status: 400 })
    }
    if (!destinationIds.length) {
      return NextResponse.json({ error: "Select at least one destination" }, { status: 400 })
    }
    if (sourceType === "video" && (typeof body.video_id !== "string" || !body.video_id)) {
      return NextResponse.json({ error: "Select a video source" }, { status: 400 })
    }
    if (sourceType === "rtmp_pull" && !isValidRtmpUrl(body.rtmp_pull_url)) {
      return NextResponse.json({ error: "Enter a valid RTMP source URL" }, { status: 400 })
    }
    if (!["none", "daily", "weekly", "monthly"].includes(repeatMode)) {
      return NextResponse.json({ error: "Invalid repeat mode" }, { status: 400 })
    }

    const { data: event, error: eventError } = await supabase
      .from("scheduled_events")
      .insert({
        user_id: user.id,
        video_id: sourceType === "video" ? body.video_id : null,
        playlist_id: playlistId,
        title: body.title.trim(),
        scheduled_at: scheduledAt,
        repeat_mode: repeatMode,
        source_type: sourceType,
        rtmp_pull_url: sourceType === "rtmp_pull" ? body.rtmp_pull_url : null,
      })
      .select()
      .single()

    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

    if (destinationIds.length > 0) {
      const destRows = destinationIds.map((destId: string) => ({
        event_id: event.id,
        destination_id: destId,
      }))

      const { error: destError } = await supabase
        .from("event_destinations")
        .insert(destRows)

      if (destError) return NextResponse.json({ error: destError.message }, { status: 500 })
    }

    // Save overlay associations
    if (overlayIds.length > 0) {
      const overlayRows = overlayIds.map((overlayId: string) => ({
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
    if (typeof id !== "string" || !id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const scheduledAt = parseFutureScheduleTime(updates.scheduled_at)
    const sourceType = parseScheduleSourceType(updates.source_type)
    const repeatMode = updates.repeat_mode || "none"
    if (!sourceType) return NextResponse.json({ error: "Invalid source type" }, { status: 400 })

    let playlistId: string | null = null
    if (sourceType === "playlist") {
      const playlistValidation = await validatePlaylistSource(supabase, updates.playlist_id)
      if (!playlistValidation.ok) {
        return NextResponse.json({ error: playlistValidation.error }, { status: playlistValidation.status })
      }
      playlistId = playlistValidation.playlistId
    }
    const destinationIds = Array.isArray(updates.destination_ids) ? updates.destination_ids : []
    const overlayIds = Array.isArray(updates.overlay_ids) ? updates.overlay_ids : []

    if (typeof updates.title !== "string" || !updates.title.trim()) {
      return NextResponse.json({ error: "A stream title is required" }, { status: 400 })
    }
    if (!scheduledAt) {
      return NextResponse.json({ error: "scheduled_at must be a valid future timestamp" }, { status: 400 })
    }
    if (!destinationIds.length) {
      return NextResponse.json({ error: "Select at least one destination" }, { status: 400 })
    }
    if (sourceType === "video" && (typeof updates.video_id !== "string" || !updates.video_id)) {
      return NextResponse.json({ error: "Select a video source" }, { status: 400 })
    }
    if (sourceType === "rtmp_pull" && !isValidRtmpUrl(updates.rtmp_pull_url)) {
      return NextResponse.json({ error: "Enter a valid RTMP source URL" }, { status: 400 })
    }
    if (!["none", "daily", "weekly", "monthly"].includes(repeatMode)) {
      return NextResponse.json({ error: "Invalid repeat mode" }, { status: 400 })
    }

    const { error: eventError } = await supabase
      .from("scheduled_events")
      .update({
        video_id: sourceType === "video" ? updates.video_id : null,
        playlist_id: playlistId,
        title: updates.title.trim(),
        scheduled_at: scheduledAt,
        repeat_mode: repeatMode,
        source_type: sourceType,
        rtmp_pull_url: sourceType === "rtmp_pull" ? updates.rtmp_pull_url : null,
        status: "scheduled",
      })
      .eq("id", id)

    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

    // Update destinations: delete old ones and insert new ones
    await supabase.from("event_destinations").delete().eq("event_id", id)
    if (destinationIds.length > 0) {
      const destRows = destinationIds.map((destId: string) => ({
        event_id: id,
        destination_id: destId,
      }))
      await supabase.from("event_destinations").insert(destRows)
    }

    // Update overlays: delete old ones and insert new ones
    await supabase.from("event_overlays").delete().eq("event_id", id)
    if (overlayIds.length > 0) {
      const overlayRows = overlayIds.map((overlayId: string) => ({
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
