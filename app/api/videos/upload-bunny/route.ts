import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { uploadToBunny, getBunnyCDNUrl } from "@/lib/bunny"

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
 * POST /api/videos/upload-bunny/finalize
 * Called after all chunks are uploaded to combine them and save metadata
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { uploadId, filename, title, duration_seconds, resolution, format, file_size } = body

    if (!uploadId || !filename) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Get CDN URL for the uploaded file
    const cdnUrl = getBunnyCDNUrl(filename, "videos")

    // Save video metadata to database
    const { data, error } = await supabase
      .from("videos")
      .insert({
        user_id: user.id,
        title: title || filename,
        filename,
        file_size: file_size || 0,
        duration_seconds: duration_seconds || null,
        resolution: resolution || null,
        format: format || null,
        storage_path: cdnUrl, // Store the CDN URL
        status: "ready",
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      video: data,
      cdnUrl,
    })
  } catch (error) {
    console.error("[Bunny Finalize] Error:", error)
    return NextResponse.json({ error: "Finalization failed" }, { status: 500 })
  }
}
