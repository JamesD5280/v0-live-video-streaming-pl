import { timingSafeEqual } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.VPS_WEBHOOK_SECRET
  if (!expectedSecret) {
    return NextResponse.json({ error: "Assembly callback is not configured" }, { status: 503 })
  }

  const authorization = req.headers.get("authorization") || ""
  const suppliedSecret = authorization.startsWith("Bearer ") ? authorization.slice(7) : ""
  const expectedBytes = Buffer.from(expectedSecret)
  const suppliedBytes = Buffer.from(suppliedSecret)
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => null)
    const videoId = body?.video_id
    const cdnUrl = body?.cdn_url
    if (typeof videoId !== "string" || !UUID_PATTERN.test(videoId) || typeof cdnUrl !== "string") {
      return NextResponse.json({ error: "Invalid video ID or CDN URL" }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(cdnUrl)
    } catch {
      return NextResponse.json({ error: "Invalid CDN URL" }, { status: 400 })
    }

    const expectedCdnHost = `${process.env.BUNNY_STORAGE_ZONE || "2mstreamsn"}.b-cdn.net`
    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.hostname.toLowerCase() !== expectedCdnHost.toLowerCase() ||
      !parsedUrl.pathname.startsWith("/videos/")
    ) {
      return NextResponse.json({ error: "CDN URL is not an approved Bunny video URL" }, { status: 400 })
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: updatedVideo, error: updateError } = await supabase
      .from("videos")
      .update({
        status: "ready",
        storage_path: parsedUrl.toString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId)
      .in("status", ["uploading", "processing"])
      .select("id,status,storage_path")
      .maybeSingle()

    if (updateError) {
      console.error("[Assembly Finalize] Database update failed:", updateError.message)
      return NextResponse.json({ error: "Could not finalize video" }, { status: 500 })
    }

    if (updatedVideo) {
      return NextResponse.json({ success: true, video: updatedVideo })
    }

    const { data: existingVideo, error: lookupError } = await supabase
      .from("videos")
      .select("id,status,storage_path")
      .eq("id", videoId)
      .maybeSingle()

    if (lookupError) {
      return NextResponse.json({ error: "Could not verify video status" }, { status: 500 })
    }
    if (!existingVideo) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 })
    }
    if (existingVideo.status === "ready" && existingVideo.storage_path === parsedUrl.toString()) {
      return NextResponse.json({ success: true, alreadyFinalized: true, video: existingVideo })
    }

    return NextResponse.json({ error: "Video is no longer awaiting assembly" }, { status: 409 })
  } catch (error) {
    console.error("[Assembly Finalize] Error:", error)
    return NextResponse.json({ error: "Assembly finalization failed" }, { status: 500 })
  }
}
