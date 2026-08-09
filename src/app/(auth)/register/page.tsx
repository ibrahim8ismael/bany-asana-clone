import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import RegisterForm from "@/components/auth/register-form"
import { authOptions } from "@/lib/auth"
import { getSafeCallbackUrl } from "@/lib/auth-redirect"

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await getServerSession(authOptions)
  const { callbackUrl } = await searchParams
  const safeCallbackUrl = getSafeCallbackUrl(callbackUrl)

  if (session) {
    redirect(safeCallbackUrl)
  }

  return <RegisterForm callbackUrl={safeCallbackUrl} />
}
