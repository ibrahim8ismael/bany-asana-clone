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
import { PasswordInput } from "@/components/ui/password-input"

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
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <span>Need an account?</span>
          <Link href={getRegisterHref(callbackUrl)} className="font-semibold text-[#0075de] transition-colors hover:underline">
            Create one
          </Link>
        </div>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {showRegisteredNotice ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
            Your account is ready. Sign in to continue.
          </div>
        ) : null}

        {formError ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200" role="alert">
            {formError}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-semibold text-[#f4f4f5]">
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
            className="h-10 rounded-md border-[#3f3f46] bg-[#18181b] px-3 text-xs text-[#f4f4f5] placeholder:text-[#71717a] focus-visible:border-[#0075de]"
          />
          {fieldErrors.email ? (
            <p id="login-email-error" className="text-xs text-rose-400">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password" className="text-xs font-semibold text-[#f4f4f5]">
              Password
            </Label>
            <div className="inline-flex items-center gap-1 text-[10px] text-[#a1a1aa]">
              <ShieldCheck className="h-3 w-3" />
              Private and secure
            </div>
          </div>
          <PasswordInput
            id="password"
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
            className="h-10 rounded-md border-[#3f3f46] bg-[#18181b] px-3 text-xs text-[#f4f4f5] placeholder:text-[#71717a] focus-visible:border-[#0075de]"
          />
          {fieldErrors.password ? (
            <p id="login-password-error" className="text-xs text-rose-400">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={pending}
          className="h-10 w-full rounded-full border-0 bg-[#0075de] text-xs font-semibold text-white transition-colors hover:bg-[#005bab]"
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
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
