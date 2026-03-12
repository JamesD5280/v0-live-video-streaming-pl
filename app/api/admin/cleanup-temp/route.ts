import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { listBunnyFiles, deleteFromBunny } from "@/lib/bunny"

/**
 * DELETE /api/admin/cleanup-temp
 * Deletes files in the temp-uploads folder on Bunny (max 500 per call to avoid timeout)
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
        deleted: 0,
        remaining: 0,
      })
    }

    console.log(`[Cleanup] Found ${files.length} files, deleting up to 500...`)

    // Only delete up to 500 files per call to avoid Vercel timeout
    const maxToDelete = 500
    const filesToDelete = files.slice(0, maxToDelete)
    
    // Delete in parallel batches of 20
    let deleted = 0
    let failed = 0
    const batchSize = 20

    for (let i = 0; i < filesToDelete.length; i += batchSize) {
      const batch = filesToDelete.slice(i, i + batchSize)
      console.log(`[Cleanup] Deleting batch ${i / batchSize + 1}, files: ${batch.map(f => f.name).join(', ').substring(0, 100)}...`)
      
      const results = await Promise.all(
        batch.map(file => deleteFromBunny(file.name, "temp-uploads"))
      )
      deleted += results.filter(r => r).length
      failed += results.filter(r => !r).length
    }

    const remaining = files.length - filesToDelete.length
    console.log(`[Cleanup] Deleted ${deleted} files, ${failed} failed, ${remaining} remaining`)

    return NextResponse.json({
      success: true,
      message: remaining > 0 
        ? `Deleted ${deleted} files. Click again to delete more (${remaining} remaining).`
        : `Deleted ${deleted} files from temp-uploads`,
      deleted,
      failed,
      total: files.length,
      remaining,
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
