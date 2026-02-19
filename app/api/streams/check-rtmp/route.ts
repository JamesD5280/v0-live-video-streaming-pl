import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"

/**
 * POST /api/streams/check-rtmp
 * Body: { url: "rtmp://..." }
 * Validates an RTMP stream is active and accessible via the streaming server.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 })

    if (!STREAMING_SERVER_URL) {
      return NextResponse.json({ error: "Streaming server not configured" }, { status: 500 })
    }

    const res = await fetch(`${STREAMING_SERVER_URL}/check-rtmp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${STREAMING_API_SECRET}`,
      },
      body: JSON.stringify({ url }),
    })

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    console.error("RTMP check error:", e)
    return NextResponse.json({ error: "Failed to check RTMP stream" }, { status: 502 })
  }
}
