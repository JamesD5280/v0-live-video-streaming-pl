import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const MAX_CATEGORY_NAME_LENGTH = 64

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const [{ data: categories, error }, { data: profile }] = await Promise.all([
      supabase
        .from("video_categories")
        .select("id, name, created_at")
        .order("name", { ascending: true }),
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle(),
    ])

    if (error) {
      console.error("Video categories GET error:", error)
      return NextResponse.json({ error: "Failed to load video categories" }, { status: 500 })
    }

    return NextResponse.json({
      categories: categories ?? [],
      canManage: profile?.role === "admin" || profile?.role === "editor",
    })
  } catch (error) {
    console.error("Video categories GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = (await req.json().catch(() => null)) as { name?: unknown } | null
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    if (!name || name.length > MAX_CATEGORY_NAME_LENGTH) {
      return NextResponse.json({ error: "Category name must be between 1 and 64 characters" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("video_categories")
      .insert({ name })
      .select("id, name, created_at")
      .single()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 })
      }
      if (error.code === "42501") {
        return NextResponse.json({ error: "Only editors and admins can manage categories" }, { status: 403 })
      }
      if (error.code === "23514") {
        return NextResponse.json({ error: "Category name must be between 1 and 64 characters" }, { status: 400 })
      }
      console.error("Video categories POST error:", error)
      return NextResponse.json({ error: "Could not create category" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error("Video categories POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
