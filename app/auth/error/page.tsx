"use client"

import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Clock, Mail, Loader2 } from "lucide-react"

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const errorCode = searchParams.get("error_code")
  const errorDescription = searchParams.get("error_description")

  const isExpired = errorCode === "otp_expired"

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card text-center">
        <CardHeader>
          <div className="mx-auto mb-4">
            <Image
              src="/images/2mstream-logo.png"
              alt="2MStream"
              width={200}
              height={60}
              className="h-14 w-auto object-contain"
              priority
            />
          </div>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            {isExpired ? (
              <Clock className="h-7 w-7 text-destructive" />
            ) : (
              <AlertTriangle className="h-7 w-7 text-destructive" />
            )}
          </div>
          <CardTitle className="text-xl text-foreground">
            {isExpired ? "Link Expired" : "Authentication Error"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {isExpired 
              ? "The confirmation link has expired or was already used."
              : errorDescription?.replace(/\+/g, " ") || "Something went wrong during authentication."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isExpired ? (
            <div className="rounded-lg bg-muted/50 p-4 text-left">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Request a new link</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Go to the login page and click "Forgot password" or ask your admin to resend the invitation.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              If this issue persists, try clearing your browser cookies or using a different browser.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href="/auth/login">Back to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  )
}
