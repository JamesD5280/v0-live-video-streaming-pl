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

    // Save video metadata to database with status 'uploading'
    // The actual assembly will be done by the VPS where it has unlimited resources
    const sanitizedTitle = sanitizeString(title || filename)
    
    console.log("[Bunny Finalize] Inserting video record with fields:", {
      user_id: user.id,
      title: sanitizedTitle,
      filename,
      file_size: fileSize,
      storage_path: `bunny://temp-uploads/${uploadId}`,
      status: "uploading",
      category_id: categoryId,
    })

    const { data, error } = await supabase
      .from("videos")
      .insert({
        user_id: user.id,
        title: sanitizedTitle,
        filename,
        file_size: fileSize,
        storage_path: `bunny://temp-uploads/${uploadId}`,
        status: "uploading",
        category_id: categoryId,
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
      const status = error.code === "42501" ? 403 : error.code === "23503" ? 400 : 500
      const errorMsg =
        status === 403
          ? "Only editors and admins can manage categories"
          : status === 400
            ? "Invalid category"
            : "Could not save video metadata"
      console.error("[Bunny Finalize] Returning error response:", errorMsg)
      return NextResponse.json({ error: errorMsg }, { status })
    }

    console.log(`[Bunny Finalize] Video saved with ID: ${data.id}`)

    // Trigger VPS webhook to assemble chunks
    const vpsWebhookSecret = process.env.VPS_WEBHOOK_SECRET
    const vpsAssemblerUrl = process.env.VPS_ASSEMBLER_URL

    if (vpsWebhookSecret && vpsAssemblerUrl) {
      try {
        console.log("[v0] Triggering VPS webhook for video:", data.id)
        const webhookResponse = await fetch(vpsAssemblerUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${vpsWebhookSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ videoId: data.id, uploadId }),
        })

        if (!webhookResponse.ok) {
          const responseText = await webhookResponse.text()
          console.error("[v0] Webhook failed:", webhookResponse.status, responseText)
        } else {
          console.log("[v0] Webhook triggered successfully")
        }
      } catch (webhookError) {
        console.error("[v0] Webhook error:", webhookError)
      }
    } else {
      console.warn("[v0] VPS_WEBHOOK_SECRET or VPS_ASSEMBLER_URL not configured")
    }

    console.log(`[Bunny Finalize] VPS webhook trigger sent for upload_id=${uploadId} and video_id=${data.id}`)

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
