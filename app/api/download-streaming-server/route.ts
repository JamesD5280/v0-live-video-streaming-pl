import { NextResponse } from "next/server"
import { readFileSync } from "fs"
import { join } from "path"

/**
 * Temporary endpoint to serve streaming-server.js for VPS download.
 * DELETE THIS FILE after the VPS has downloaded the file.
 */
export async function GET() {
  try {
    const filePath = join(process.cwd(), "scripts", "streaming-engine", "streaming-server.js")
    const content = readFileSync(filePath, "utf-8")
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": "attachment; filename=streaming-server.js",
      },
    })
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }
}
