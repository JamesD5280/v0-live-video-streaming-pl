import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getBunnyCDNUrl } from "@/lib/bunny"

/**
 * POST /api/videos/finalize-assembly
 * Called by VPS after it has assembled chunks and uploaded to Bunny
 * Updates video status from 'uploading' to 'ready'
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { upload_id, video_id, filename, file_size } = body

    if (!upload_id || !video_id || !filename) {
      return NextResponse.json(
        { error: "Missing required fields: upload_id, video_id, filename" },
        { status: 400 }
      )
    }

    console.log("[Assembly Finalize] Finalizing assembly for:", {
      upload_id,
      video_id,
      filename,
      file_size,
    })

    // Get CDN URL for the final file
    const cdnUrl = getBunnyCDNUrl(filename, "videos")

    // Update video record: mark as 'ready' and update storage_path
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("videos")
      .update({
        status: "ready",
        storage_path: cdnUrl,
        file_size: file_size || undefined,
        upload_id: null, // Clear the upload_id since assembly is complete
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
