import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/videos/trigger-assembly
 * VPS webhook endpoint to trigger video assembly
 * Calls the VPS assembler to process all uploading videos
 */
export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.VPS_WEBHOOK_SECRET
    const vpsAssemblerUrl = process.env.VPS_ASSEMBLER_URL

    if (!webhookSecret || !vpsAssemblerUrl) {
      console.error("[Trigger Assembly] Missing VPS configuration")
      return NextResponse.json(
        { error: "Server not configured for VPS assembly" },
        { status: 500 }
      )
    }

    // Verify webhook secret
    const authHeader = req.headers.get("Authorization")
    if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
      console.error("[Trigger Assembly] Invalid webhook secret")
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    console.log("[Trigger Assembly] Calling VPS assembler at:", vpsAssemblerUrl)

    // Call the VPS assembler
    const response = await fetch(vpsAssemblerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trigger: "webhook" }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("[Trigger Assembly] VPS error:", error)
      return NextResponse.json(
        { error: "VPS assembler failed" },
        { status: response.status }
      )
    }

    const result = await response.json()
    console.log("[Trigger Assembly] VPS response:", result)

    return NextResponse.json({
      success: true,
      message: "Assembly triggered on VPS",
      vpsResponse: result,
    })
  } catch (error) {
    console.error("[Trigger Assembly] Error:", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `Trigger failed: ${errorMsg}` },
      { status: 500 }
    )
  }
}
