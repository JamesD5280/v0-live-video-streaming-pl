import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("id", user.id)
    .single()

  // Auto-create settings if they don't exist
  if (error && error.code === "PGRST116") {
    const { data: newData, error: insertError } = await supabase
      .from("user_settings")
      .insert({ id: user.id })
      .select()
      .single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    data = newData
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  // Ensure settings row exists first
  await supabase
    .from("user_settings")
    .upsert({ id: user.id }, { onConflict: "id" })

  const { data, error } = await supabase
    .from("user_settings")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
