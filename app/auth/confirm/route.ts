import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /auth/confirm
 * Handles Supabase email confirmation redirects.
 * Supports both PKCE flow (code param) and OTP flow (token_hash param).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  const supabase = await createClient()

  // PKCE flow: Supabase sends a code parameter
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const redirectTo = request.nextUrl.clone()
      redirectTo.pathname = next
      redirectTo.searchParams.delete('code')
      redirectTo.searchParams.delete('next')
      return NextResponse.redirect(redirectTo)
    }
  }

  // OTP flow: Supabase sends token_hash + type
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error) {
      const redirectTo = request.nextUrl.clone()
      redirectTo.pathname = next
      redirectTo.searchParams.delete('token_hash')
      redirectTo.searchParams.delete('type')
      redirectTo.searchParams.delete('next')
      return NextResponse.redirect(redirectTo)
    }
  }

  // If verification fails, redirect to error page
  const redirectTo = request.nextUrl.clone()
  redirectTo.pathname = '/auth/error'
  return NextResponse.redirect(redirectTo)
}
