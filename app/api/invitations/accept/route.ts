import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/invitations/accept
 * Body: { token }
 * Called after a user signs up via an invitation link.
 * Marks the invitation as accepted and sets the user's role.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { token } = body

    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

    // Look up the invitation by token
    const { data: invitation } = await supabase
      .from("invitations")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .single()

    if (!invitation) {
      return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 })
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase.from("invitations").update({ status: "expired" }).eq("id", invitation.id)
      return NextResponse.json({ error: "Invitation has expired" }, { status: 410 })
    }

    // Check email matches
    if (invitation.email !== user.email?.toLowerCase()) {
      return NextResponse.json({ error: "This invitation was sent to a different email address" }, { status: 403 })
    }

    // Update user's profile role
    await supabase
      .from("profiles")
      .update({ role: invitation.role })
      .eq("id", user.id)

    // Mark invitation as accepted
    await supabase
      .from("invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invitation.id)

    return NextResponse.json({ success: true, role: invitation.role })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
