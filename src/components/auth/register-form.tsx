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
import { PasswordInput } from "@/components/ui/password-input"

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
      description="Join the company workspace in a few seconds. Your account will be added to the shared workspace so you can start moving work forward right away."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <span>Already set up?</span>
          <Link href={getLoginHref(callbackUrl)} className="font-semibold text-[#0075de] transition-colors hover:underline">
            Sign in instead
          </Link>
        </div>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {formError ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200" role="alert">
            {formError}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="full-name" className="text-xs font-semibold text-[#f4f4f5]">
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
            className="h-10 rounded-md border-[#3f3f46] bg-[#18181b] px-3 text-xs text-[#f4f4f5] placeholder:text-[#71717a] focus-visible:border-[#0075de]"
          />
          {fieldErrors.fullName ? (
            <p id="register-name-error" className="text-xs text-rose-400">
              {fieldErrors.fullName}
            </p>
          ) : (
            <p id="register-name-note" className="text-[11px] text-[#a1a1aa]">
              Use the name teammates will recognize in comments, tasks, and boards.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="register-email" className="text-xs font-semibold text-[#f4f4f5]">
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
            className="h-10 rounded-md border-[#3f3f46] bg-[#18181b] px-3 text-xs text-[#f4f4f5] placeholder:text-[#71717a] focus-visible:border-[#0075de]"
          />
          {fieldErrors.email ? (
            <p id="register-email-error" className="text-xs text-rose-400">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="register-password" className="text-xs font-semibold text-[#f4f4f5]">
              Password
            </Label>
            <div className="inline-flex items-center gap-1 text-[10px] text-[#a1a1aa]">
              <Sparkles className="h-3 w-3" />
              Quick setup
            </div>
          </div>
          <PasswordInput
            id="register-password"
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
            className="h-10 rounded-md border-[#3f3f46] bg-[#18181b] px-3 text-xs text-[#f4f4f5] placeholder:text-[#71717a] focus-visible:border-[#0075de]"
          />
          {fieldErrors.password ? (
            <p id="register-password-error" className="text-xs text-rose-400">
              {fieldErrors.password}
            </p>
          ) : (
            <p id="register-password-note" className="text-[11px] text-[#a1a1aa]">
              Use at least 8 characters. You can change it later from your account settings.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-[#3f3f46] bg-[#18181b] px-3.5 py-2.5 text-xs text-[#a1a1aa]">
          You will be added to the company workspace automatically after signup. A workspace admin can invite teammates.
        </div>

        <Button
          type="submit"
          disabled={pending}
          className="h-10 w-full rounded-full border-0 bg-[#0075de] text-xs font-semibold text-white transition-colors hover:bg-[#005bab]"
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
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
