import { NextRequest } from "next/server"
import { readFileSync } from "fs"
import { join } from "path"

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file")

  if (file === "package.json") {
    const packageJson = JSON.stringify(
      {
        name: "2mstream-streaming-engine",
        version: "1.0.0",
        type: "module",
        dependencies: {
          express: "^4.18.2",
          cors: "^2.8.5",
        },
      },
      null,
      2
    )
    return new Response(packageJson, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="package.json"',
      },
    })
  }

  // Serve streaming-server.js from the scripts directory
  try {
    const filePath = join(process.cwd(), "scripts", "streaming-engine", "streaming-server.js")
    const content = readFileSync(filePath, "utf-8")
    return new Response(content, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Content-Disposition": 'attachment; filename="streaming-server.js"',
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "File not found", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
