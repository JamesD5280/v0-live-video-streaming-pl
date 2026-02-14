import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("streams")
    .select("*, video:videos(*), stream_destinations(*, destination:destinations(*))")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  // Create stream
  const { data: stream, error: streamError } = await supabase
    .from("streams")
    .insert({
      user_id: user.id,
      video_id: body.video_id,
      title: body.title,
      status: body.go_live ? "live" : "pending",
      started_at: body.go_live ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (streamError) return NextResponse.json({ error: streamError.message }, { status: 500 })

  // Add stream destinations
  if (body.destination_ids && body.destination_ids.length > 0) {
    const destRows = body.destination_ids.map((destId: string) => ({
      stream_id: stream.id,
      destination_id: destId,
      status: body.go_live ? "connected" : "pending",
    }))

    const { error: destError } = await supabase
      .from("stream_destinations")
      .insert(destRows)

    if (destError) return NextResponse.json({ error: destError.message }, { status: 500 })
  }

  return NextResponse.json(stream)
}

export async function PATCH(req: NextRequest) {
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
}
