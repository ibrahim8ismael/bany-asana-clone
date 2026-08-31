import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isSuperAdminUser, workspaceAccessWhere } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import AdminMembersClient from "./page-client"

export default async function AdminMembersPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId) {
    redirect("/login")
  }

  const isSuperAdmin = await isSuperAdminUser(userId)
  const managedWorkspaceWhere = workspaceAccessWhere(userId, "admin", isSuperAdmin)
  const canManageWorkspace = isSuperAdmin || Boolean(await prisma.workspace.findFirst({
    where: managedWorkspaceWhere,
    select: { id: true },
  }))

  if (!canManageWorkspace) {
    redirect("/account")
  }

  const [requests, workspaces] = await Promise.all([
    isSuperAdmin ? prisma.adminAccessRequest.findMany({
      include: {
        user: { select: { id: true, full_name: true, email: true, avatar_url: true } },
        workspace: { select: { id: true, name: true } },
        reviewer: { select: { full_name: true } },
      },
      orderBy: [{ status: "asc" }, { created_at: "desc" }],
    }) : Promise.resolve([]),
    prisma.workspace.findMany({
      where: isSuperAdmin ? undefined : managedWorkspaceWhere,
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                full_name: true,
                email: true,
                avatar_url: true,
                is_super_admin: true,
              },
            },
          },
          orderBy: { joined_at: "asc" },
        },
      },
      orderBy: { created_at: "asc" },
    }),
  ])

  return <AdminMembersClient workspaces={workspaces} requests={requests} isSuperAdmin={isSuperAdmin} />
}
