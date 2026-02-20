"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AcceptInvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    async function accept() {
      try {
        const res = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
        if (res.ok) {
          setStatus("success")
          setTimeout(() => router.push("/"), 2000)
        } else {
          const data = await res.json()
          setErrorMsg(data.error || "Failed to accept invitation")
          setStatus("error")
        }
      } catch {
        setErrorMsg("Something went wrong")
        setStatus("error")
      }
    }
    accept()
  }, [token, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-6">
          {status === "loading" && (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Activating your account...</p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <CardTitle className="text-lg text-foreground">Welcome to the team!</CardTitle>
              <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="text-center text-sm text-muted-foreground">{errorMsg}</p>
              <Button variant="outline" onClick={() => router.push("/auth/login")}>
                Go to Login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
