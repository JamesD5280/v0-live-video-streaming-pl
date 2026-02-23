import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Public routes that don't need auth
  const publicPaths = ['/auth/login', '/auth/sign-up', '/auth/sign-up-success', '/auth/error', '/api/download-server', '/api/schedule/cron', '/api/notifications', '/invite/']
  const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path))

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // If env vars are missing, let all requests through (don't redirect to avoid loops)
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            )
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            )
          },
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user && !isPublicPath) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }

    if (user && isPublicPath) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch (error) {
    console.error('Middleware auth error:', error)
    // On error, allow public paths through, redirect everything else to login
    if (isPublicPath) {
      return supabaseResponse
    }
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }
}
