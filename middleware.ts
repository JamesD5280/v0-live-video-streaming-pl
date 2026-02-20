import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Skip auth entirely for the download endpoint
  if (request.nextUrl.pathname.startsWith('/api/download-server')) {
    return NextResponse.next()
  }

  try {
    return await updateSession(request)
  } catch (error) {
    console.error('[v0] Root middleware error:', error)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|download/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|json)$).*)',
  ],
}
