import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("invitations")
      .select("*")
      .eq("invited_by", user.id)
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Only admins can invite users" }, { status: 403 })
    }

    const body = await req.json()
    const { email, role } = body

    if (!email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const validRoles = ["admin", "editor", "viewer"]
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    // Check if there's already a pending invitation for this email
    const { data: existing } = await supabase
      .from("invitations")
      .select("id")
      .eq("email", email.trim().toLowerCase())
      .eq("status", "pending")
      .single()

    if (existing) {
      return NextResponse.json({ error: "A pending invitation already exists for this email" }, { status: 409 })
    }

    const { data, error } = await supabase
      .from("invitations")
      .insert({
        invited_by: user.id,
        email: email.trim().toLowerCase(),
        role,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Missing invitation id" }, { status: 400 })

    const { error } = await supabase
      .from("invitations")
      .delete()
      .eq("id", id)
      .eq("invited_by", user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
