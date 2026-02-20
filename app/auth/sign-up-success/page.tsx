import Image from "next/image"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MailCheck } from "lucide-react"

export default function SignUpSuccessPage() {
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
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl text-foreground">Check your email</CardTitle>
          <CardDescription className="text-muted-foreground">
            {"We've sent you a confirmation link. Please check your email to verify your account and start streaming."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {"Didn't receive the email? Check your spam folder or try signing up again."}
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/auth/login">Back to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
