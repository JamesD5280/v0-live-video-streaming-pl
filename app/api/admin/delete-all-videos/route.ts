import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET - Check how many videos exist
 * DELETE - Delete all videos for current user
 */

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { count, error } = await supabase
      .from("videos")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ count: count || 0 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Get all videos for current user
    const { data: videos, error: fetchError } = await supabase
      .from("videos")
      .select("id")
      .eq("user_id", user.id)

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

    if (!videos || videos.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 })
    }

    // Delete all videos
    const videoIds = videos.map(v => v.id)
    const { error: deleteError } = await supabase
      .from("videos")
      .delete()
      .in("id", videoIds)

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    return NextResponse.json({ success: true, deleted: videoIds.length })
  } catch (error) {
    console.error("[Delete Videos] Error:", error)
    return NextResponse.json({ error: "Failed to delete videos" }, { status: 500 })
  }
}
