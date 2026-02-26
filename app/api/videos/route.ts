import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    console.error("Videos GET error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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
        storage_path: body.storage_path || null,
        status: "ready",
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    console.error("Videos POST error:", e)
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

    // Get the video record first so we know the filename
    const { data: video } = await supabase
      .from("videos")
      .select("filename")
      .eq("id", id)
      .single()

    // Delete from database
    const { error } = await supabase.from("videos").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Delete from streaming server
    if (video?.filename) {
      const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL
      const STREAMING_API_SECRET = process.env.STREAMING_API_SECRET || "change-this-secret"
      if (STREAMING_SERVER_URL) {
        try {
          await fetch(`${STREAMING_SERVER_URL}/delete-video`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${STREAMING_API_SECRET}`,
            },
            body: JSON.stringify({ filename: video.filename }),
          })
        } catch {
          // Server delete failed but DB record is already removed -- not critical
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Videos DELETE error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
