import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { getBunnyCDNUrl } from "@/lib/bunny"

/**
 * POST /api/videos/finalize-assembly
 * Called by VPS after it has assembled chunks and uploaded to Bunny
 * Updates video status from 'uploading' to 'ready'
 * 
 * This endpoint uses service role credentials (server-side only)
 * so it can be called from the VPS without user authentication
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { video_id, cdn_url } = body

    if (!video_id || !cdn_url) {
      return NextResponse.json(
        { error: "Missing required fields: video_id, cdn_url" },
        { status: 400 }
      )
    }

    console.log("[Assembly Finalize] Finalizing assembly for:", {
      video_id,
      cdn_url,
    })

    // Create Supabase client with service role (admin) key for server-side operations
    // This bypasses authentication and RLS policies
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[Assembly Finalize] Missing Supabase credentials")
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data, error } = await supabase
      .from("videos")
      .update({
        status: "ready",
        storage_path: cdn_url,
      })
      .eq("id", video_id)
      .select()
      .single()

    if (error) {
      console.error("[Assembly Finalize] Database update error:", error)
      return NextResponse.json(
        { error: `Failed to update video: ${error.message}` },
        { status: 500 }
      )
    }

    console.log("[Assembly Finalize] Video finalized successfully:", {
      video_id: data.id,
      status: data.status,
      storage_path: data.storage_path,
    })

    return NextResponse.json({
      success: true,
      video: data,
      message: "Video assembly finalized and marked as ready",
    })
  } catch (error) {
    console.error("[Assembly Finalize] Error:", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `Finalization failed: ${errorMsg}` },
      { status: 500 }
    )
  }
}
