import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { code } = await request.json()
    const validCode = process.env.INVITE_CODE

    if (!validCode) {
      return NextResponse.json(
        { error: "Invite system is not configured" },
        { status: 500 }
      )
    }

    if (code !== validCode) {
      return NextResponse.json(
        { error: "Invalid invite code" },
        { status: 403 }
      )
    }

    return NextResponse.json({ valid: true })
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    )
  }
}
