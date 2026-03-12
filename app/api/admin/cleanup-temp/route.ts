import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { listBunnyFiles, deleteFromBunny } from "@/lib/bunny"

/**
 * DELETE /api/admin/cleanup-temp
 * Deletes all files in the temp-uploads folder on Bunny
 */
export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // List all files in temp-uploads
    const files = await listBunnyFiles("temp-uploads")
    
    if (files.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No files to delete",
        deleted: 0 
      })
    }

    console.log(`[Cleanup] Found ${files.length} files to delete`)

    // Delete all files in parallel (batch of 10 at a time to avoid overwhelming)
    let deleted = 0
    let failed = 0
    const batchSize = 10

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(file => deleteFromBunny(file.name, "temp-uploads"))
      )
      deleted += results.filter(r => r).length
      failed += results.filter(r => !r).length
    }

    console.log(`[Cleanup] Deleted ${deleted} files, ${failed} failed`)

    return NextResponse.json({
      success: true,
      message: `Deleted ${deleted} files from temp-uploads`,
      deleted,
      failed,
      total: files.length,
    })
  } catch (error) {
    console.error("[Cleanup] Error:", error)
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 })
  }
}

/**
 * GET /api/admin/cleanup-temp
 * Returns the count of files in temp-uploads
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const files = await listBunnyFiles("temp-uploads")
    
    return NextResponse.json({
      count: files.length,
      files: files.slice(0, 20).map(f => ({ name: f.name, size: f.size })), // Show first 20
    })
  } catch (error) {
    console.error("[Cleanup] Error:", error)
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 })
  }
}
