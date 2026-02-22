import { createClient as createServiceClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

async function callStreamingServer(path: string, body: Record<string, unknown>) {
  if (!STREAMING_SERVER_URL) return { error: "Streaming server not configured" }
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
 * GET /api/schedule/cron
 *
 * Called by Vercel Cron (or externally) every minute to check for due scheduled events.
 * Creates a stream and starts it for any events whose scheduled_at is in the past and status is "pending".
 */
export async function GET(req: NextRequest) {
  // Verify cron secret if set
  if (CRON_SECRET) {
    const authHeader = req.headers.get("authorization")
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const supabase = createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const now = new Date().toISOString()

  // Find all pending events that are due
  const { data: dueEvents, error } = await supabase
    .from("scheduled_events")
    .select("*, video:videos(*), event_destinations(*, destination:destinations(*)), event_overlays(*, overlay:overlays(*))")
    .in("status", ["pending", "scheduled"])
    .lte("scheduled_at", now)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!dueEvents || dueEvents.length === 0) {
    return NextResponse.json({ message: "No due events", checked: now })
  }

  const results = []

  for (const event of dueEvents) {
    try {
      // Mark event as running
      await supabase
        .from("scheduled_events")
        .update({ status: "running" })
        .eq("id", event.id)

      // Build destinations
      const destinations = (event.event_destinations || [])
        .map((ed: { destination: { id: string; rtmp_url: string; stream_key: string; name: string } | null }) => {
          if (!ed.destination) return null
          return {
            id: ed.destination.id,
            name: ed.destination.name,
            rtmpUrl: ed.destination.rtmp_url,
            streamKey: ed.destination.stream_key,
          }
        })
        .filter(Boolean)

      if (destinations.length === 0) {
        await supabase.from("scheduled_events").update({ status: "error" }).eq("id", event.id)
        await createNotification(supabase, event.user_id, {
          type: "schedule_error",
          title: "Schedule failed",
          message: `"${event.title}" has no destinations configured.`,
          event_id: event.id,
        })
        results.push({ eventId: event.id, error: "No destinations" })
        continue
      }

      // Determine source
      const supabaseStorageBase = `${SUPABASE_URL}/storage/v1/object/public`
      let videoSources: { url?: string; path?: string; title?: string }[] = []
      let loop = true
      const isRtmpPull = event.source_type === "rtmp_pull"

      if (isRtmpPull) {
        if (!event.rtmp_pull_url) {
          await supabase.from("scheduled_events").update({ status: "error" }).eq("id", event.id)
          await createNotification(supabase, event.user_id, {
            type: "schedule_error",
            title: "Schedule failed",
            message: `"${event.title}" has no RTMP pull URL.`,
            event_id: event.id,
          })
          results.push({ eventId: event.id, error: "No RTMP pull URL" })
          continue
        }
        videoSources = [{ url: event.rtmp_pull_url, title: "RTMP Pull Source" }]
        loop = false
      } else if (event.video) {
        videoSources = [{
          url: event.video.storage_path
            ? `${supabaseStorageBase}/videos/${event.video.storage_path}`
            : undefined,
          path: event.video.filename,
          title: event.video.title,
        }]
      } else {
        await supabase.from("scheduled_events").update({ status: "error" }).eq("id", event.id)
        await createNotification(supabase, event.user_id, {
          type: "schedule_error",
          title: "Schedule failed",
          message: `"${event.title}" has no video source.`,
          event_id: event.id,
        })
        results.push({ eventId: event.id, error: "No video source" })
        continue
      }

      // Build overlays
      const overlays = (event.event_overlays || [])
        .filter((eo: { overlay: unknown }) => eo.overlay)
        .map((eo: { overlay: {
          id: string; type: string; image_path?: string; video_path?: string;
          loop_overlay?: boolean; text_content?: string; font_size: number;
          font_color: string; bg_color: string; position: string;
          position_x?: number; position_y?: number; size_percent: number;
          opacity: number; scroll_speed?: number;
        }}) => ({
          id: eo.overlay.id,
          type: eo.overlay.type,
          imagePath: eo.overlay.image_path || null,
          videoPath: eo.overlay.video_path || null,
          loopOverlay: eo.overlay.loop_overlay !== false,
          textContent: eo.overlay.text_content || null,
          fontSize: eo.overlay.font_size,
          fontColor: eo.overlay.font_color,
          bgColor: eo.overlay.bg_color,
          position: eo.overlay.position,
          positionX: eo.overlay.position_x ?? undefined,
          positionY: eo.overlay.position_y ?? undefined,
          sizePercent: eo.overlay.size_percent,
          opacity: eo.overlay.opacity,
          scrollSpeed: eo.overlay.scroll_speed ?? undefined,
        }))

      // Create a stream record
      const { data: stream, error: streamError } = await supabase
        .from("streams")
        .insert({
          user_id: event.user_id,
          title: event.title,
          video_id: isRtmpPull ? null : event.video_id,
          rtmp_pull_url: isRtmpPull ? event.rtmp_pull_url : null,
          status: "pending",
        })
        .select()
        .single()

      if (streamError || !stream) {
        await supabase.from("scheduled_events").update({ status: "error" }).eq("id", event.id)
        results.push({ eventId: event.id, error: "Failed to create stream" })
        continue
      }

      // Add stream destinations
      const destRows = destinations.map((d: { id: string }) => ({
        stream_id: stream.id,
        destination_id: d.id,
      }))
      await supabase.from("stream_destinations").insert(destRows)

      // Add stream overlays
      if (overlays.length > 0) {
        const overlayRows = overlays.map((o: { id: string }) => ({
          stream_id: stream.id,
          overlay_id: o.id,
        }))
        await supabase.from("stream_overlays").insert(overlayRows)
      }

      // Start the stream on the engine
      const engineResult = await callStreamingServer("/start", {
        streamId: stream.id,
        videoSources,
        videoUrl: videoSources[0]?.url,
        videoPath: videoSources[0]?.path,
        destinations,
        overlays,
        loop,
        isPlaylist: false,
        isRtmpPull,
        rtmpPullUrl: isRtmpPull ? event.rtmp_pull_url : null,
      })

      if (engineResult?.error) {
        await supabase.from("streams").update({ status: "error" }).eq("id", stream.id)
        await supabase.from("scheduled_events").update({ status: "error" }).eq("id", event.id)
        await createNotification(supabase, event.user_id, {
          type: "schedule_error",
          title: "Schedule failed",
          message: `"${event.title}" failed to start: ${engineResult.error}`,
          event_id: event.id,
          stream_id: stream.id,
        })
        results.push({ eventId: event.id, error: engineResult.error })
        continue
      }

      // Mark stream as live
      await supabase.from("streams").update({
        status: "live",
        started_at: new Date().toISOString(),
      }).eq("id", stream.id)
      await supabase.from("stream_destinations").update({ status: "connected" }).eq("stream_id", stream.id)

      // Mark event as completed
      await supabase.from("scheduled_events").update({ status: "completed" }).eq("id", event.id)

      // Create success notification
      await createNotification(supabase, event.user_id, {
        type: "schedule_started",
        title: "Scheduled stream started",
        message: `"${event.title}" is now live.`,
        event_id: event.id,
        stream_id: stream.id,
      })

      // Handle repeating events
      if (event.repeat_mode && event.repeat_mode !== "none") {
        const nextDate = getNextScheduleDate(new Date(event.scheduled_at), event.repeat_mode)
        if (nextDate) {
          await supabase.from("scheduled_events").insert({
            user_id: event.user_id,
            video_id: event.video_id,
            title: event.title,
            scheduled_at: nextDate.toISOString(),
            repeat_mode: event.repeat_mode,
            source_type: event.source_type,
            rtmp_pull_url: event.rtmp_pull_url,
            status: "pending",
          }).select().single().then(async ({ data: newEvent }) => {
            if (newEvent) {
              // Copy destinations to new event
              if (destRows.length > 0) {
                await supabase.from("event_destinations").insert(
                  destinations.map((d: { id: string }) => ({ event_id: newEvent.id, destination_id: d.id }))
                )
              }
              // Copy overlays to new event
              if (overlays.length > 0) {
                await supabase.from("event_overlays").insert(
                  overlays.map((o: { id: string }) => ({ event_id: newEvent.id, overlay_id: o.id }))
                )
              }
            }
          })
        }
      }

      // Send webhook if configured
      await sendWebhook(supabase, event.user_id, {
        event: "schedule.started",
        title: event.title,
        stream_id: stream.id,
        scheduled_at: event.scheduled_at,
        source_type: event.source_type,
      })

      results.push({ eventId: event.id, streamId: stream.id, success: true })
    } catch (err) {
      await supabase.from("scheduled_events").update({ status: "error" }).eq("id", event.id)
      results.push({ eventId: event.id, error: String(err) })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}

function getNextScheduleDate(current: Date, repeatMode: string): Date | null {
  const next = new Date(current)
  switch (repeatMode) {
    case "daily":
      next.setDate(next.getDate() + 1)
      return next
    case "weekly":
      next.setDate(next.getDate() + 7)
      return next
    case "monthly":
      next.setMonth(next.getMonth() + 1)
      return next
    default:
      return null
  }
}

async function createNotification(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  data: { type: string; title: string; message: string; event_id?: string; stream_id?: string }
) {
  await supabase.from("notifications").insert({
    user_id: userId,
    type: data.type,
    title: data.title,
    message: data.message,
    scheduled_event_id: data.event_id || null,
    stream_id: data.stream_id || null,
  })
}

async function sendWebhook(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  payload: Record<string, unknown>
) {
  const { data: settings } = await supabase
    .from("user_settings")
    .select("webhook_url")
    .eq("id", userId)
    .single()

  if (!settings?.webhook_url) return

  try {
    await fetch(settings.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
    })
  } catch {
    // Webhook delivery failed silently
  }
}
