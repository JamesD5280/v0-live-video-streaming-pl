import { put } from "@vercel/blob"
import { NextResponse } from "next/server"
// @ts-expect-error -- imported as raw string via webpack asset/source
import streamingServerContent from "@/lib/engine/streaming-server.dat"

export const dynamic = "force-dynamic"

const PACKAGE_JSON = JSON.stringify({
  name: "2mstream-engine",
  version: "1.0.0",
  type: "module",
  dependencies: { express: "^4.21.0", cors: "^2.8.5" },
}, null, 2)

export async function GET(req: Request) {
  const url = new URL(req.url)
  const file = url.searchParams.get("file") || "streaming-server.js"
  const action = url.searchParams.get("action")

  // Direct download of package.json (small, inlined)
  if (file === "package.json") {
    return new NextResponse(PACKAGE_JSON, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="package.json"',
      },
    })
  }

  // Direct download of streaming-server.js (imported at build time)
  if (file === "streaming-server.js" && action !== "blob") {
    return new NextResponse(streamingServerContent, {
      headers: {
        "Content-Type": "application/javascript",
        "Content-Disposition": 'attachment; filename="streaming-server.js"',
      },
    })
  }

  // Upload to Vercel Blob for a permanent CDN URL (backup approach)
  if (action === "blob") {
    try {
      const blob = await put("streaming-engine/streaming-server.js", streamingServerContent, {
        access: "public",
        contentType: "application/javascript",
      })
      const pkgBlob = await put("streaming-engine/package.json", PACKAGE_JSON, {
        access: "public",
        contentType: "application/json",
      })
      return NextResponse.json({
        success: true,
        streamingServerUrl: blob.url,
        packageJsonUrl: pkgBlob.url,
      })
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "Unknown file" }, { status: 404 })
}
