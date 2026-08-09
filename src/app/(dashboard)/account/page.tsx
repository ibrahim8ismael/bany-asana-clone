import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import AccountClient from "./profile-client"

export default async function AccountPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId) {
    redirect("/login")
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      full_name: true,
      email: true,
      avatar_url: true,
      is_super_admin: true,
      timezone: true,
      created_at: true,
      _count: {
        select: {
          tasks_assigned: true,
          tasks_created: true,
          comments: true,
        },
      },
      workspaces: {
        orderBy: { joined_at: "asc" },
        select: {
          role: true,
          joined_at: true,
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      access_requests: {
        orderBy: { created_at: "desc" },
        take: 5,
        select: {
          id: true,
          requested_role: true,
          status: true,
          note: true,
          review_note: true,
          created_at: true,
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  })

  if (!user) {
    redirect("/login")
  }

  const canImport = user.is_super_admin

  return <AccountClient user={user} canImport={canImport} />
}
