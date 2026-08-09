import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import LoginForm from "@/components/auth/login-form"
import { authOptions } from "@/lib/auth"
import { getSafeCallbackUrl } from "@/lib/auth-redirect"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; registered?: string }>
}) {
  const session = await getServerSession(authOptions)
  const { callbackUrl, registered } = await searchParams
  const safeCallbackUrl = getSafeCallbackUrl(callbackUrl)

  if (session) {
    redirect(safeCallbackUrl)
  }

  return <LoginForm callbackUrl={safeCallbackUrl} showRegisteredNotice={registered === "1"} />
}
