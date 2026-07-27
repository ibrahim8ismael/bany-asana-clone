"use client"

import Link from "next/link"
import { useState } from "react"
import { LoaderCircle, ShieldCheck } from "lucide-react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import AuthFormShell from "@/components/auth/auth-form-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type LoginFieldErrors = {
  email?: string
  password?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getRegisterHref(callbackUrl: string) {
  if (callbackUrl === "/home") return "/register"

  const params = new URLSearchParams({ callbackUrl })
  return `/register?${params.toString()}`
}

export default function LoginForm({
  callbackUrl,
  showRegisteredNotice = false,
}: {
  callbackUrl: string
  showRegisteredNotice?: boolean
}) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({})
  const [formError, setFormError] = useState("")
  const [pending, setPending] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()
    const nextErrors: LoginFieldErrors = {}

    if (!normalizedEmail) {
      nextErrors.email = "Enter your work email."
    } else if (!emailPattern.test(normalizedEmail)) {
      nextErrors.email = "Enter a valid email address."
    }

    if (!password) {
      nextErrors.password = "Enter your password."
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      setFormError("")
      return
    }

    setPending(true)
    setFormError("")
    setFieldErrors({})

    const result = await signIn("credentials", {
      email: normalizedEmail,
      password,
      callbackUrl,
      redirect: false,
    })

    setPending(false)

    if (!result || result.error) {
      setFormError("That email and password combination did not match our records.")
      return
    }

    router.replace(result.url || callbackUrl)
    router.refresh()
  }

  return (
    <AuthFormShell
      eyebrow="Welcome Back"
      title="Sign in to TaskFlow"
      description="Use your work account to get back to active clients, project handoffs, and the next task that needs attention."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Need an account?</span>
          <Link href={getRegisterHref(callbackUrl)} className="font-medium text-orange-200 transition-colors hover:text-orange-100">
            Create one
          </Link>
        </div>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        {showRegisteredNotice ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            Your account is ready. Sign in to continue.
          </div>
        ) : null}

        {formError ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100" role="alert">
            {formError}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-white/80">
            Work email
          </Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }))
              if (formError) setFormError("")
            }}
            placeholder="team@company.com"
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            className="h-11 rounded-2xl border-white/10 bg-white/5 px-4 text-white placeholder:text-white/25 focus-visible:border-orange-300/40 focus-visible:ring-orange-300/20 dark:bg-white/5"
          />
          {fieldErrors.email ? (
            <p id="login-email-error" className="text-xs text-rose-200">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password" className="text-sm font-medium text-white/80">
              Password
            </Label>
            <div className="inline-flex items-center gap-1 text-xs text-white/35">
              <ShieldCheck className="h-3.5 w-3.5" />
              Private and secure
            </div>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }))
              if (formError) setFormError("")
            }}
            placeholder="Enter your password"
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
            className="h-11 rounded-2xl border-white/10 bg-white/5 px-4 text-white placeholder:text-white/25 focus-visible:border-orange-300/40 focus-visible:ring-orange-300/20 dark:bg-white/5"
          />
          {fieldErrors.password ? (
            <p id="login-password-error" className="text-xs text-rose-200">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-2xl border-0 bg-orange-500 text-sm font-semibold text-white transition-colors hover:bg-orange-400"
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Signing in...
            </span>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </AuthFormShell>
  )
}
