export function getSafeCallbackUrl(value: string | null | undefined) {
  const trimmed = value?.trim()

  if (!trimmed) return "/home"
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/home"
  if (trimmed === "/login" || trimmed.startsWith("/login?")) return "/home"
  if (trimmed === "/register" || trimmed.startsWith("/register?")) return "/home"

  return trimmed
}
