import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { uploadToBunny, getBunnyCDNUrl, downloadFromBunny, deleteFromBunny } from "@/lib/bunny"

// Sanitize strings to remove special characters that might violate database constraints
function sanitizeString(str: string): string {
  if (!str) return str
  // Remove non-ASCII characters and keep only alphanumeric, spaces, hyphens, underscores, dots
  return str.replace(/[^\w\s\-\.]/gu, "").trim()
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
    const chunk = formData.get("chunk")
    const filename = formData.get("filename")
    const uploadId = formData.get("uploadId")
    const chunkIndex = Number(formData.get("chunkIndex"))
    const totalChunks = Number(formData.get("totalChunks"))

    if (!(chunk instanceof Blob) || typeof filename !== "string" || !filename || typeof uploadId !== "string" || !UUID_PATTERN.test(uploadId)) {
      return NextResponse.json({ error: "Missing or invalid required fields" }, { status: 400 })
    }
    if (
      !Number.isSafeInteger(chunkIndex) ||
      !Number.isSafeInteger(totalChunks) ||
      totalChunks < 1 ||
      chunkIndex < 0 ||
      chunkIndex >= totalChunks
    ) {
      return NextResponse.json({ error: "Invalid chunk index" }, { status: 400 })
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
 * Called after all chunks are uploaded to save metadata and enqueue server assembly
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const uploadId = body.uploadId
    const filename = body.filename
    const totalChunks = body.totalChunks
    if (
      typeof uploadId !== "string" ||
      !uploadId ||
      typeof filename !== "string" ||
      !filename ||
      typeof totalChunks !== "number" ||
      !Number.isSafeInteger(totalChunks) ||
      totalChunks < 1
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const categoryId = body.category_id === undefined ? null : body.category_id
    if (categoryId !== null && (typeof categoryId !== "string" || !UUID_PATTERN.test(categoryId))) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 })
    }

    if (categoryId !== null) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()

      if (profileError) {
        console.error("Bunny upload category permission check failed:", profileError)
        return NextResponse.json({ error: "Could not verify category permissions" }, { status: 500 })
      }
      if (profile?.role !== "admin" && profile?.role !== "editor") {
        return NextResponse.json({ error: "Only editors and admins can manage categories" }, { status: 403 })
      }
    }

    const title = typeof body.title === "string" ? body.title : filename
    const fileSize =
      typeof body.file_size === "number" && Number.isSafeInteger(body.file_size) && body.file_size >= 0
        ? body.file_size
        : 0

    console.log(`[Bunny Finalize] Saving video metadata with upload_id for later assembly by VPS`)
    console.log(`[Bunny Finalize] Video will be assembled by VPS: uploadId=${uploadId}, filename=${filename}, totalChunks=${totalChunks}`)

    const sanitizedTitle = sanitizeString(title || filename)
    const temporaryStoragePath = `bunny://temp-uploads/${uploadId}`

    const { data: existingVideo, error: lookupError } = await supabase
      .from("videos")
      .select("id,status")
      .eq("user_id", user.id)
      .eq("storage_path", temporaryStoragePath)
      .limit(1)
      .maybeSingle()

    if (lookupError) {
      console.error("[Bunny Finalize] Could not check for an existing upload:", lookupError)
      return NextResponse.json({ error: "Could not save video metadata" }, { status: 500 })
    }

    let video = existingVideo
    if (video?.status === "ready") {
      return NextResponse.json({ success: true, state: "ready", video, uploadId, totalChunks })
    }
    if (video?.status === "processing") {
      return NextResponse.json({ success: true, state: "processing", video, uploadId, totalChunks }, { status: 202 })
    }
    if (video?.status === "error") {
      const { data: resetVideo, error: resetError } = await supabase
        .from("videos")
        .update({ status: "uploading", updated_at: new Date().toISOString() })
        .eq("id", video.id)
        .select("id,status")
        .single()

      if (resetError) {
        console.error("[Bunny Finalize] Could not re-queue the failed upload:", resetError)
        return NextResponse.json({ error: "Could not re-queue video assembly", videoId: video.id }, { status: 500 })
      }
      video = resetVideo
    }

    if (!video) {
      const { data: insertedVideo, error } = await supabase
        .from("videos")
        .insert({
          user_id: user.id,
          title: sanitizedTitle,
          filename,
          file_size: fileSize,
          storage_path: temporaryStoragePath,
          status: "uploading",
          category_id: categoryId,
        })
        .select("id,status")
        .single()

      if (error) {
        console.error("[Bunny Finalize] Supabase insert failed:", error.code, error.message)
        const status = error.code === "42501" ? 403 : error.code === "23503" ? 400 : 500
        const errorMsg =
          status === 403
            ? "Only editors and admins can manage categories"
            : status === 400
              ? "Invalid category"
              : "Could not save video metadata"
        return NextResponse.json({ error: errorMsg }, { status })
      }
      video = insertedVideo
    }

    const vpsWebhookSecret = process.env.VPS_WEBHOOK_SECRET
    const vpsAssemblerUrl = process.env.VPS_ASSEMBLER_URL
    if (!vpsWebhookSecret || !vpsAssemblerUrl) {
      console.error("[Bunny Finalize] Assembly service configuration is missing")
      return NextResponse.json(
        { error: "Video is saved, but the assembly service is unavailable. It remains queued for recovery.", videoId: video.id, state: "queued" },
        { status: 503 },
      )
    }

    try {
      const webhookResponse = await fetch(vpsAssemblerUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${vpsWebhookSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ videoId: video.id, uploadId, totalChunks }),
        signal: AbortSignal.timeout(15_000),
      })

      if (!webhookResponse.ok) {
        console.error("[Bunny Finalize] Assembly service rejected the job:", webhookResponse.status)
        return NextResponse.json(
          { error: "Video is saved, but the assembly service rejected the job. It remains queued for recovery.", videoId: video.id, state: "queued" },
          { status: 502 },
        )
      }
    } catch (webhookError) {
      console.error("[Bunny Finalize] Could not reach the assembly service:", webhookError)
      return NextResponse.json(
        { error: "Video is saved, but the assembly service could not be reached. It remains queued for recovery.", videoId: video.id, state: "queued" },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      state: "processing",
      video,
      uploadId,
      totalChunks,
    }, { status: 202 })
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
