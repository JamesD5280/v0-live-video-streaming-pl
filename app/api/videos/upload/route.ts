import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

/**
 * GET /api/videos/upload
 * Returns a signed upload URL for the streaming server.
 * The browser uploads directly to the streaming server to bypass
 * Vercel's body size limits.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!STREAMING_SERVER_URL) {
      return NextResponse.json({ error: "Streaming server not configured" }, { status: 503 })
    }

    const filename = req.nextUrl.searchParams.get("filename")
    if (!filename) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 })
    }

    // Return the direct upload URL for the streaming server
    return NextResponse.json({
      uploadUrl: `${STREAMING_SERVER_URL}/upload`,
      authToken: STREAMING_API_SECRET,
      filename,
    })
  } catch (e) {
    console.error("Upload URL error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/videos/upload
 * After a successful upload to the streaming server, the client calls this
 * to save the video metadata to the database.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    const { data, error } = await supabase
      .from("videos")
      .insert({
        user_id: user.id,
        title: body.title,
        filename: body.filename,
        file_size: body.file_size || 0,
        duration_seconds: body.duration_seconds || null,
        resolution: body.resolution || null,
        format: body.format || null,
        storage_path: null, // stored on streaming server, not Supabase
        status: "ready",
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    console.error("Upload metadata error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
