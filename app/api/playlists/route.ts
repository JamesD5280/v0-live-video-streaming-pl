import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("playlists")
      .select("*, playlist_items(*, video:videos(*))")
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Sort playlist items by position
    const sorted = data?.map((p: Record<string, unknown>) => ({
      ...p,
      playlist_items: ((p.playlist_items as Record<string, unknown>[]) || []).sort(
        (a: Record<string, unknown>, b: Record<string, unknown>) => (a.position as number) - (b.position as number)
      ),
    }))

    return NextResponse.json(sorted)
  } catch (e) {
    console.error("Playlists GET error:", e)
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
      .from("playlists")
      .insert({
        user_id: user.id,
        name: body.name,
        description: body.description || null,
        loop: body.loop !== false,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Insert playlist items if provided
    if (body.video_ids?.length > 0) {
      const items = body.video_ids.map((vid: string, i: number) => ({
        playlist_id: data.id,
        video_id: vid,
        position: i,
      }))
      const { error: itemsError } = await supabase.from("playlist_items").insert(items)
      if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error("Playlists POST error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { id, video_ids, ...updates } = body

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    // Update playlist metadata
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("playlists")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Replace playlist items if provided
    if (video_ids !== undefined) {
      await supabase.from("playlist_items").delete().eq("playlist_id", id)
      if (video_ids.length > 0) {
        const items = video_ids.map((vid: string, i: number) => ({
          playlist_id: id,
          video_id: vid,
          position: i,
        }))
        const { error: itemsError } = await supabase.from("playlist_items").insert(items)
        if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Playlists PATCH error:", e)
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

    const { error } = await supabase.from("playlists").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Playlists DELETE error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
