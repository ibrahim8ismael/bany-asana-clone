"use server"

import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canAccessWorkspace, isSuperAdminUser } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { isWorkspaceAdmin } from "@/lib/project-membership"

function normalizeWorkspaceName(value: unknown) {
  if (typeof value !== "string") return null
  const name = value.trim()
  return name.length >= 2 && name.length <= 80 ? name : null
}

function workspaceSlugBase(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace"
}

async function requireUserId() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) throw new Error("Unauthorized")
  return userId
}

function revalidateWorkspaceViews() {
  revalidatePath("/", "layout")
  revalidatePath("/admin/members")
}

export async function switchWorkspace(data: { workspaceId: string }) {
  try {
    const userId = await requireUserId()
    if (typeof data?.workspaceId !== "string" || !data.workspaceId) {
      return { error: "Workspace is required" }
    }

    if (!(await canAccessWorkspace(userId, data.workspaceId, "view"))) {
      return { error: "Workspace not found or access denied" }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { active_workspace_id: data.workspaceId },
    })

    revalidateWorkspaceViews()
    return { success: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to switch workspace" }
  }
}

export async function createWorkspace(data: { name: string }) {
  try {
    const userId = await requireUserId()
    const name = normalizeWorkspaceName(data?.name)
    if (!name) return { error: "Workspace name must be between 2 and 80 characters" }

    const baseSlug = workspaceSlugBase(name)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomUUID().slice(0, 8)}`

      try {
        const workspace = await prisma.$transaction(async (tx) => {
          const created = await tx.workspace.create({
            data: { name, slug, owner_id: userId },
            select: { id: true, name: true, slug: true },
          })

          await tx.workspaceMember.create({
            data: { workspace_id: created.id, user_id: userId, role: "owner" },
          })
          await tx.user.update({
            where: { id: userId },
            data: { active_workspace_id: created.id },
          })

          return created
        })

        revalidateWorkspaceViews()
        return { success: true, workspace }
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue
        throw error
      }
    }

    return { error: "Could not create a unique workspace address" }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create workspace" }
  }
}

export async function renameWorkspace(data: { workspaceId: string; name: string }) {
  try {
    const userId = await requireUserId()
    const name = normalizeWorkspaceName(data?.name)
    if (!name) return { error: "Workspace name must be between 2 and 80 characters" }
    if (typeof data?.workspaceId !== "string" || !data.workspaceId) {
      return { error: "Workspace is required" }
    }

    const [workspace, superAdmin] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: data.workspaceId },
        select: {
          id: true,
          owner_id: true,
          members: {
            where: { user_id: userId },
            select: { role: true },
            take: 1,
          },
        },
      }),
      isSuperAdminUser(userId),
    ])

    if (!workspace) return { error: "Workspace not found" }
    const role = workspace.members[0]?.role
    if (!superAdmin && workspace.owner_id !== userId && !isWorkspaceAdmin(role)) {
      return { error: "Workspace admin access required" }
    }

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { name },
    })

    revalidateWorkspaceViews()
    return { success: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to rename workspace" }
  }
}
