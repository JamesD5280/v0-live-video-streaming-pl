import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Skip auth for download and preview endpoints
  if (
    request.nextUrl.pathname.startsWith('/api/download-server') ||
    request.nextUrl.pathname.startsWith('/api/videos/preview') ||
    request.nextUrl.pathname.startsWith('/api/streams/preview')
  ) {
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
    '/((?!_next/static|_next/image|favicon.ico|download/.*|engine/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|json|dat)$).*)',
  ],
}
