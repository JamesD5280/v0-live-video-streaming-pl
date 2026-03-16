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

    console.log(`[Bunny Finalize] Assembling ${totalChunks} chunks for ${filename}`)

    // Download first chunk as the base file, then append others
    // This way we never load the entire file into memory at once
    console.log("[Bunny Finalize] Downloading first chunk...")
    const firstChunkData = await downloadFromBunny(`${uploadId}-chunk-0`, "temp-uploads")
    if (!firstChunkData) {
      return NextResponse.json({ error: "Failed to download first chunk" }, { status: 500 })
    }

    // Upload first chunk as the base file in videos folder
    let uploadResult = await uploadToBunny(filename, firstChunkData, "videos")
    if (!uploadResult.success) {
      return NextResponse.json({ error: `Failed to upload first chunk: ${uploadResult.error}` }, { status: 500 })
    }
    console.log("[Bunny Finalize] Uploaded first chunk as base file")

    // For remaining chunks, download them one at a time and re-upload the combined file
    // This is inefficient but necessary to stay within memory limits
    console.log(`[Bunny Finalize] Appending ${totalChunks - 1} additional chunks...`)
    for (let i = 1; i < totalChunks; i++) {
      console.log(`[Bunny Finalize] Processing chunk ${i}/${totalChunks - 1}`)
      
      // Download current chunk
      const chunkData = await downloadFromBunny(`${uploadId}-chunk-${i}`, "temp-uploads")
      if (!chunkData) {
        return NextResponse.json({ error: `Failed to download chunk ${i}` }, { status: 500 })
      }

      // Download the current file from Bunny
      const currentFile = await downloadFromBunny(filename, "videos")
      if (!currentFile) {
        return NextResponse.json({ error: `Failed to download current file from videos` }, { status: 500 })
      }

      // Append the new chunk
      const combinedFile = Buffer.concat([currentFile, chunkData])
      
      // Re-upload the combined file
      uploadResult = await uploadToBunny(filename, combinedFile, "videos")
      if (!uploadResult.success) {
        return NextResponse.json({ error: `Failed to append chunk ${i}: ${uploadResult.error}` }, { status: 500 })
      }
      
      console.log(`[Bunny Finalize] Appended chunk ${i}, file size now: ${combinedFile.length} bytes`)
    }

    console.log("[Bunny Finalize] Assembly complete")

    // Clean up temp chunks (don't wait for this)
    Promise.all(
      Array.from({ length: totalChunks }, (_, i) => 
        deleteFromBunny(`${uploadId}-chunk-${i}`, "temp-uploads")
      )
    ).catch(err => console.error("[Bunny Finalize] Cleanup error:", err))

    // Get CDN URL for the uploaded file
    const cdnUrl = getBunnyCDNUrl(filename, "videos")

    // Save video metadata to database
    // Sanitize name to remove special characters that might violate constraints
    const sanitizedName = sanitizeString(title || filename)
    
    // Log all fields before insert (using actual DB column names)
    console.log("[Bunny Finalize] Inserting with fields:", {
      user_id: user.id,
      name: sanitizedName,
      size_bytes: file_size || 0,
      duration: duration_seconds ? String(duration_seconds) : null,
      resolution: resolution || null,
      format: format || null,
      storage_path: cdnUrl,
      status: "ready",
    })

    const { data, error } = await supabase
      .from("videos")
      .insert({
        user_id: user.id,
        name: sanitizedName,
        size_bytes: file_size || 0,
        duration: duration_seconds ? String(duration_seconds) : null,
        resolution: resolution || null,
        format: format || null,
        storage_path: cdnUrl,
        status: "ready",
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Bunny Finalize] Video saved: ${cdnUrl}`)

    return NextResponse.json({
      success: true,
      video: data,
      cdnUrl,
    })
  } catch (error) {
    console.error("[Bunny Finalize] Error:", error)
    if (error instanceof Error) {
      console.error("[Bunny Finalize] Error message:", error.message)
      console.error("[Bunny Finalize] Error stack:", error.stack)
    }
    return NextResponse.json({ error: "Finalization failed" }, { status: 500 })
  }
}
