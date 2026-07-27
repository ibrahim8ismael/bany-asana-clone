"use client"

import Link from "next/link"
import { useState } from "react"
import { LoaderCircle, Sparkles } from "lucide-react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import AuthFormShell from "@/components/auth/auth-form-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type RegisterFieldErrors = {
  fullName?: string
  email?: string
  password?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getLoginHref(callbackUrl: string, registered = false) {
  if (callbackUrl === "/home" && !registered) return "/login"

  const params = new URLSearchParams()
  if (callbackUrl !== "/home") params.set("callbackUrl", callbackUrl)
  if (registered) params.set("registered", "1")

  return `/login?${params.toString()}`
}

export default function RegisterForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})
  const [formError, setFormError] = useState("")
  const [pending, setPending] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedName = fullName.trim()
    const normalizedEmail = email.trim().toLowerCase()
    const nextErrors: RegisterFieldErrors = {}

    if (normalizedName.length < 2) {
      nextErrors.fullName = "Use at least 2 characters for the name your team will recognize."
    }

    if (!normalizedEmail) {
      nextErrors.email = "Enter your work email."
    } else if (!emailPattern.test(normalizedEmail)) {
      nextErrors.email = "Enter a valid email address."
    }

    if (password.length < 8) {
      nextErrors.password = "Use at least 8 characters."
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      setFormError("")
      return
    }

    setPending(true)
    setFormError("")
    setFieldErrors({})

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: normalizedName, email: normalizedEmail, password }),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      setPending(false)
      setFormError(payload?.message || "We could not create your account right now.")
      return
    }

    const signInResult = await signIn("credentials", {
      email: normalizedEmail,
      password,
      callbackUrl,
      redirect: false,
    })

    setPending(false)

    if (!signInResult || signInResult.error) {
      router.replace(getLoginHref(callbackUrl, true))
      router.refresh()
      return
    }

    router.replace(signInResult.url || callbackUrl)
    router.refresh()
  }

  return (
    <AuthFormShell
      eyebrow="New Account"
      title="Create your TaskFlow account"
      description="Join the workspace in a few seconds. We will create your personal workspace automatically so you can start moving work forward right away."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Already set up?</span>
          <Link href={getLoginHref(callbackUrl)} className="font-medium text-orange-200 transition-colors hover:text-orange-100">
            Sign in instead
          </Link>
        </div>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        {formError ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100" role="alert">
            {formError}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="full-name" className="text-sm font-medium text-white/80">
            Full name
          </Label>
          <Input
            id="full-name"
            autoComplete="name"
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value)
              if (fieldErrors.fullName) setFieldErrors((current) => ({ ...current, fullName: undefined }))
              if (formError) setFormError("")
            }}
            placeholder="Jordan Lee"
            aria-invalid={fieldErrors.fullName ? true : undefined}
            aria-describedby={fieldErrors.fullName ? "register-name-error" : "register-name-note"}
            className="h-11 rounded-2xl border-white/10 bg-white/5 px-4 text-white placeholder:text-white/25 focus-visible:border-orange-300/40 focus-visible:ring-orange-300/20 dark:bg-white/5"
          />
          {fieldErrors.fullName ? (
            <p id="register-name-error" className="text-xs text-rose-200">
              {fieldErrors.fullName}
            </p>
          ) : (
            <p id="register-name-note" className="text-xs text-white/35">
              Use the name teammates will recognize in comments, tasks, and boards.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-email" className="text-sm font-medium text-white/80">
            Work email
          </Label>
          <Input
            id="register-email"
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
            aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
            className="h-11 rounded-2xl border-white/10 bg-white/5 px-4 text-white placeholder:text-white/25 focus-visible:border-orange-300/40 focus-visible:ring-orange-300/20 dark:bg-white/5"
          />
          {fieldErrors.email ? (
            <p id="register-email-error" className="text-xs text-rose-200">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="register-password" className="text-sm font-medium text-white/80">
              Password
            </Label>
            <div className="inline-flex items-center gap-1 text-xs text-white/35">
              <Sparkles className="h-3.5 w-3.5" />
              Quick setup
            </div>
          </div>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }))
              if (formError) setFormError("")
            }}
            placeholder="Choose a password"
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? "register-password-error" : "register-password-note"}
            className="h-11 rounded-2xl border-white/10 bg-white/5 px-4 text-white placeholder:text-white/25 focus-visible:border-orange-300/40 focus-visible:ring-orange-300/20 dark:bg-white/5"
          />
          {fieldErrors.password ? (
            <p id="register-password-error" className="text-xs text-rose-200">
              {fieldErrors.password}
            </p>
          ) : (
            <p id="register-password-note" className="text-xs text-white/35">
              Use at least 8 characters. You can change it later from your account settings.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/60">
          Your workspace is created automatically after signup, so you can land in the app without extra setup.
        </div>

        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-2xl border-0 bg-orange-500 text-sm font-semibold text-white transition-colors hover:bg-orange-400"
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Creating account...
            </span>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthFormShell>
  )
}
