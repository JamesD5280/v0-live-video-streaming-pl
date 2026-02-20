import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/invitations/lookup?token=uuid
 * Public endpoint to look up invitation details by token.
 * Returns only non-sensitive fields (email, role, status, expiry).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get("token")
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("invitations")
      .select("email, role, status, expires_at")
      .eq("token", token)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
