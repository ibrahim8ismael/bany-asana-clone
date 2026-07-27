"use server"

import bcrypt from "bcryptjs"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function getSessionUserId() {
  const session = await getServerSession(authOptions)
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function updateCurrentUserProfile(data: { fullName: string; avatarUrl?: string | null; timezone?: string | null }) {
  const userId = await getSessionUserId()
  if (!userId) return { error: "Unauthorized" }

  const fullName = data.fullName.trim()
  if (!fullName) return { error: "Name is required" }
  if (fullName.length > 100) return { error: "Name must be 100 characters or fewer" }

  const avatarUrl = data.avatarUrl?.trim() || null
  if (avatarUrl && avatarUrl.length > 2048) return { error: "Avatar URL is too long" }
  if (avatarUrl && !avatarUrl.startsWith("/uploads/avatars/")) {
    try {
      const parsedUrl = new URL(avatarUrl)
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return { error: "Avatar URL must use HTTP or HTTPS" }
      }
    } catch {
      return { error: "Avatar URL is invalid" }
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      full_name: fullName,
      avatar_url: avatarUrl,
      timezone: data.timezone?.trim() || null,
    },
  })

  revalidatePath("/account")
  revalidatePath("/home")
  revalidatePath("/my-tasks")
  return { success: true }
}

export async function updateCurrentUserPassword(data: { currentPassword: string; newPassword: string }) {
  const userId = await getSessionUserId()
  if (!userId) return { error: "Unauthorized" }

  const newPassword = data.newPassword.trim()
  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters" }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password_hash: true },
  })

  if (!user?.password_hash) {
    return { error: "Password cannot be changed for this account" }
  }

  const valid = await bcrypt.compare(data.currentPassword, user.password_hash)
  if (!valid) {
    return { error: "Current password is incorrect" }
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { id: userId },
    data: { password_hash: passwordHash },
  })

  revalidatePath("/account")
  return { success: true }
}
