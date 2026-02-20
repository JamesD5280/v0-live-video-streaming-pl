import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Redirect to the static files in /public/engine/
export async function GET(req: Request) {
  const url = new URL(req.url)
  const file = url.searchParams.get("file") || "streaming-server.js"

  const fileMap: Record<string, string> = {
    "streaming-server.js": "/engine/streaming-server.dat",
    "package.json": "/engine/package.dat",
  }

  const path = fileMap[file]
  if (!path) {
    return NextResponse.json({ error: "Unknown file" }, { status: 404 })
  }

  // Redirect to the static file
  return NextResponse.redirect(new URL(path, url.origin))
}
