import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("scheduled_events")
    .select("*, video:videos(*), event_destinations(*, destination:destinations(*))")
    .order("scheduled_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  const { data: event, error: eventError } = await supabase
    .from("scheduled_events")
    .insert({
      user_id: user.id,
      video_id: body.video_id,
      title: body.title,
      scheduled_at: body.scheduled_at,
      repeat_mode: body.repeat_mode || "none",
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

  return NextResponse.json(event)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("scheduled_events").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
