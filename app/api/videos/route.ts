import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    console.log("[v0] Videos GET - user:", user?.id, "authError:", authError?.message)

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false })

    console.log("[v0] Videos GET - data count:", data?.length, "error:", error?.message)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    console.error("[v0] Videos GET crash:", e)
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

    console.log("[v0] Videos POST - data:", data?.id, "error:", error?.message)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    console.error("[v0] Videos POST crash:", e)
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

    const { error } = await supabase.from("videos").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[v0] Videos DELETE crash:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
