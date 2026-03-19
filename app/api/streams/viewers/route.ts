import { createClient as createServiceClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

/**
 * POST /api/streams/viewers
 * 
 * Updates the viewer count for a stream. Can be called by:
 * 1. The VPS streaming server to report aggregated viewer counts
 * 2. A cron job that fetches viewer counts from platform APIs (YouTube, Twitch, etc.)
 * 
 * Request body:
 * - streamId: string (required)
 * - viewerCount: number (required)
 * 
 * Note: For accurate viewer counts, you would need to integrate with:
 * - YouTube Live Streaming API (https://developers.google.com/youtube/v3/live/docs)
 * - Twitch Helix API (https://dev.twitch.tv/docs/api/reference/#get-streams)
 * - Facebook Graph API (https://developers.facebook.com/docs/graph-api)
 * 
 * Each platform requires OAuth authentication and API keys.
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate using the streaming API secret
    const authHeader = req.headers.get("authorization")
    if (authHeader !== `Bearer ${STREAMING_API_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { streamId, viewerCount } = body

    if (!streamId) {
      return NextResponse.json({ error: "Missing streamId" }, { status: 400 })
    }

    if (typeof viewerCount !== "number" || viewerCount < 0) {
      return NextResponse.json({ error: "Invalid viewerCount" }, { status: 400 })
    }

    const supabase = createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Update the viewer count
    const { data, error } = await supabase
      .from("streams")
      .update({ 
        viewer_count: viewerCount,
        updated_at: new Date().toISOString()
      })
      .eq("id", streamId)
      .select()
      .single()

    if (error) {
      console.error("Failed to update viewer count:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      streamId,
      viewerCount: data.viewer_count
    })
  } catch (e) {
    console.error("Viewer count update error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * GET /api/streams/viewers?streamId=xxx
 * 
 * Get the current viewer count for a stream
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const streamId = searchParams.get("streamId")

    if (!streamId) {
      return NextResponse.json({ error: "Missing streamId" }, { status: 400 })
    }

    const supabase = createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data, error } = await supabase
      .from("streams")
      .select("id, viewer_count, status")
      .eq("id", streamId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      streamId: data.id,
      viewerCount: data.viewer_count || 0,
      status: data.status
    })
  } catch (e) {
    console.error("Viewer count get error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
