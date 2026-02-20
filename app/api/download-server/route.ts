import { readFileSync } from "fs"
import { join } from "path"

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

  if (file === "package.json") {
    return new Response(PACKAGE_JSON, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="package.json"',
      },
    })
  }

  if (file === "streaming-server.js") {
    try {
      const filePath = join(process.cwd(), "scripts", "streaming-engine", "streaming-server.js")
      const content = readFileSync(filePath, "utf-8")
      return new Response(content, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": 'attachment; filename="streaming-server.js"',
        },
      })
    } catch (err) {
      return new Response(JSON.stringify({
        error: "File not found in serverless bundle",
        cwd: process.cwd(),
        detail: String(err),
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }
  }

  return new Response("Unknown file", { status: 404 })
}
