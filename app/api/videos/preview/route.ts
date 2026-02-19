import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

/**
 * GET /api/videos/preview?filename=video.mp4
 * 
 * Returns a signed direct URL to stream the video from the streaming server.
 * The browser then loads the video directly (bypasses Vercel's 4.5MB body limit).
 * A temporary token is generated so the streaming server can verify the request.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const filename = searchParams.get("filename")
    if (!filename) return NextResponse.json({ error: "Missing filename" }, { status: 400 })

    if (!STREAMING_SERVER_URL) {
      return NextResponse.json({ error: "Streaming server not configured" }, { status: 500 })
    }

    // Generate a signed token that expires in 1 hour
    const expires = Date.now() + 3600 * 1000
    const payload = `${filename}:${expires}`
    const token = createHmac("sha256", STREAMING_API_SECRET)
      .update(payload)
      .digest("hex")

    const directUrl = `${STREAMING_SERVER_URL}/stream-video/${encodeURIComponent(filename)}?token=${token}&expires=${expires}`

    return NextResponse.json({ url: directUrl })
  } catch (e) {
    console.error("[v0] Video preview error:", e)
    return NextResponse.json({ error: "Failed to generate preview URL" }, { status: 500 })
  }
}
