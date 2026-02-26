"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Image from "next/image"
import { Loader2, CheckCircle2, XCircle, Shield, Pencil, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const roleLabels: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  admin: { label: "Admin", icon: Shield, color: "text-primary border-primary/30 bg-primary/10" },
  editor: { label: "Editor", icon: Pencil, color: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
  viewer: { label: "Viewer", icon: Eye, color: "text-muted-foreground border-border bg-muted" },
}

interface InvitationData {
  email: string
  role: string
  expires_at: string
  status: string
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Sign up form state
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function loadInvitation() {
      try {
        const res = await fetch(`/api/invitations/lookup?token=${token}`)
        if (!res.ok) {
          const data = await res.json()
          setError(data.error || "Invalid invitation link")
        } else {
          const data = await res.json()
          if (data.status !== "pending") {
            setError("This invitation has already been used or expired.")
          } else if (new Date(data.expires_at) < new Date()) {
            setError("This invitation has expired.")
          } else {
            setInvitation(data)
          }
        }
      } catch {
        setError("Failed to load invitation")
      }
      setLoading(false)
    }
    loadInvitation()
  }, [token])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invitation) return
    setSubmitting(true)
    setSubmitError(null)

    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email: invitation.email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/invite/${token}/accept`,
        data: {
          display_name: displayName,
          invitation_token: token,
        },
      },
    })

    if (signUpError) {
      setSubmitError(signUpError.message)
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-6">
            <XCircle className="h-12 w-12 text-destructive" />
            <p className="text-center text-sm text-muted-foreground">{error}</p>
            <Link href="/auth/login">
              <Button variant="outline">Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-6">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <CardTitle className="text-lg text-foreground">Check your email</CardTitle>
            <p className="text-center text-sm text-muted-foreground">
              We sent a confirmation link to <strong className="text-foreground">{invitation?.email}</strong>.
              Click the link to activate your account.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const role = roleLabels[invitation?.role || "viewer"]
  const RoleIcon = role.icon

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center">
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
          <CardTitle className="text-xl text-foreground">You&apos;re invited!</CardTitle>
          <CardDescription className="text-muted-foreground">
            You&apos;ve been invited to join the team as:
          </CardDescription>
          <div className="flex justify-center pt-2">
            <Badge variant="outline" className={cn("gap-1.5 text-sm px-3 py-1", role.color)}>
              <RoleIcon className="h-4 w-4" />
              {role.label}
            </Badge>
          </div>
        </CardHeader>
        <form onSubmit={handleSignUp}>
          <CardContent className="flex flex-col gap-4">
            {submitError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {submitError}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label className="text-foreground">Email</Label>
              <Input
                value={invitation?.email || ""}
                disabled
                className="border-border bg-secondary/50 text-muted-foreground"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName" className="text-foreground">Display Name</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="border-border bg-secondary text-foreground"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="border-border bg-secondary text-foreground"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Join Team"
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
