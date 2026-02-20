import { put, list } from "@vercel/blob"
import { readFileSync } from "fs"
import { join } from "path"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const PACKAGE_JSON = JSON.stringify({
  name: "2mstream-engine",
  version: "1.0.0",
  type: "module",
  dependencies: { express: "^4.21.0", cors: "^2.8.5" },
}, null, 2)

async function getOrUploadToBlob(filename: string, content: string, contentType: string): Promise<string> {
  // Check if already uploaded
  const { blobs } = await list({ prefix: `streaming-engine/${filename}` })
  if (blobs.length > 0) {
    return blobs[0].url
  }
  // Upload to blob
  const blob = await put(`streaming-engine/${filename}`, content, {
    access: "public",
    contentType,
  })
  return blob.url
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const file = url.searchParams.get("file") || "streaming-server.js"

  try {
    if (file === "package.json") {
      const blobUrl = await getOrUploadToBlob("package.json", PACKAGE_JSON, "application/json")
      return NextResponse.redirect(blobUrl)
    }

    if (file === "streaming-server.js") {
      // Read the file from the project at build/runtime
      let content: string
      try {
        content = readFileSync(join(process.cwd(), "lib", "engine", "streaming-server.dat"), "utf-8")
      } catch {
        // Fallback paths
        try {
          content = readFileSync(join(process.cwd(), "scripts", "streaming-engine", "streaming-server.js"), "utf-8")
        } catch {
          return NextResponse.json({ error: "streaming-server.js not found on server" }, { status: 500 })
        }
      }
      const blobUrl = await getOrUploadToBlob("streaming-server.js", content, "application/javascript")
      return NextResponse.redirect(blobUrl)
    }

    return NextResponse.json({ error: "Unknown file" }, { status: 404 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
