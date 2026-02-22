import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Skip auth for download, preview, and cron endpoints
  if (
    request.nextUrl.pathname.startsWith('/api/download-server') ||
    request.nextUrl.pathname.startsWith('/api/videos/preview') ||
    request.nextUrl.pathname.startsWith('/api/streams/preview') ||
    request.nextUrl.pathname.startsWith('/api/schedule/cron') ||
    request.nextUrl.pathname.startsWith('/api/notifications')
  ) {
    return NextResponse.next()
  }

  try {
    return await updateSession(request)
  } catch (error) {
    console.error('Root middleware error:', error)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|download/.*|engine/.*|api/schedule/cron|api/notifications|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|json|dat)$).*)',
  ],
}
