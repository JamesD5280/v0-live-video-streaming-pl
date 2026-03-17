import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { uploadToBunny, getBunnyCDNUrl, downloadFromBunny, deleteFromBunny } from "@/lib/bunny"

// Sanitize strings to remove special characters that might violate database constraints
function sanitizeString(str: string): string {
  if (!str) return str
  // Remove non-ASCII characters and keep only alphanumeric, spaces, hyphens, underscores, dots
  return str.replace(/[^\w\s\-\.]/gu, "").trim()
}

/**
 * POST /api/videos/upload-bunny
 * Handles chunked uploads directly to Bunny CDN Storage
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const formData = await req.formData()
    const chunk = formData.get("chunk") as Blob
    const filename = formData.get("filename") as string
    const uploadId = formData.get("uploadId") as string
    const chunkIndex = parseInt(formData.get("chunkIndex") as string)
    const totalChunks = parseInt(formData.get("totalChunks") as string)

    if (!chunk || !filename || !uploadId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const buffer = Buffer.from(await chunk.arrayBuffer())
    const chunkFilename = `${uploadId}-chunk-${chunkIndex}`

    // Upload chunk to Bunny temporary directory
    const tempDir = "temp-uploads"
    const result = await uploadToBunny(chunkFilename, buffer, tempDir)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // If this is the last chunk, notify completion
    if (chunkIndex === totalChunks - 1) {
      return NextResponse.json({
        success: true,
        completed: true,
        uploadId,
        message: "All chunks uploaded successfully",
      })
    }

    return NextResponse.json({
      success: true,
      completed: false,
      chunkIndex,
      progress: ((chunkIndex + 1) / totalChunks) * 100,
    })
  } catch (error) {
    console.error("[Bunny Upload] Error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

/**
 * PUT /api/videos/upload-bunny
 * Called after all chunks are uploaded to combine them and save metadata
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { uploadId, filename, title, duration_seconds, resolution, format, file_size, totalChunks } = body

    if (!uploadId || !filename || !totalChunks) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    console.log(`[Bunny Finalize] Saving video metadata with upload_id for later assembly by VPS`)
    console.log(`[Bunny Finalize] Video will be assembled by VPS: uploadId=${uploadId}, filename=${filename}, totalChunks=${totalChunks}`)

    // Save video metadata to database with status 'uploading'
    // The actual assembly will be done by the VPS where it has unlimited resources
    const sanitizedTitle = sanitizeString(title || filename)
    
    console.log("[Bunny Finalize] Inserting video record with fields:", {
      user_id: user.id,
      title: sanitizedTitle,
      filename,
      file_size: file_size || 0,
      storage_path: `bunny://temp-uploads/${uploadId}`,
      status: "uploading",
    })

    const { data, error } = await supabase
      .from("videos")
      .insert({
        user_id: user.id,
        title: sanitizedTitle,
        filename,
        file_size: file_size || 0,
        storage_path: `bunny://temp-uploads/${uploadId}`,
        status: "uploading",
      })
      .select()
      .single()

    if (error) {
      console.error("[Bunny Finalize] Supabase insert error:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      const errorMsg = `Database error: ${error.message}`
      console.error("[Bunny Finalize] Returning error response:", errorMsg)
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    console.log(`[Bunny Finalize] Video saved with ID: ${data.id}`)
    console.log(`[Bunny Finalize] VPS should now call /api/videos/finalize-assembly with upload_id=${uploadId} and video_id=${data.id}`)

    return NextResponse.json({
      success: true,
      video: data,
      message: "Video metadata saved. Chunks uploaded to Bunny. Waiting for VPS to assemble.",
      uploadId,
      totalChunks,
    })
  } catch (error) {
    console.error("[Bunny Finalize] Catch block error:", error)
    if (error instanceof Error) {
      console.error("[Bunny Finalize] Error message:", error.message)
      console.error("[Bunny Finalize] Error stack:", error.stack)
    }
    const errorMsg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Finalization failed: ${errorMsg}` }, { status: 500 })
  }
}
