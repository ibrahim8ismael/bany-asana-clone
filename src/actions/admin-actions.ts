"use server"

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { authOptions } from "@/lib/auth"
import { isSuperAdminUser } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

async function getSessionUserId() {
  const session = await getServerSession(authOptions)
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

async function requireSuperAdmin() {
  const userId = await getSessionUserId()
  if (!userId) throw new Error("Unauthorized")

  const allowed = await isSuperAdminUser(userId)
  if (!allowed) throw new Error("Super admin access required")

  return userId
}

const WORKSPACE_MEMBER_ROLES = ["admin", "member", "guest"] as const
type WorkspaceMemberRole = (typeof WORKSPACE_MEMBER_ROLES)[number]

function isWorkspaceMemberRole(value: unknown): value is WorkspaceMemberRole {
  return typeof value === "string" && WORKSPACE_MEMBER_ROLES.includes(value as WorkspaceMemberRole)
}

async function getWorkspaceAdminContext(workspaceId: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { error: "Unauthorized" } as const
  if (typeof workspaceId !== "string" || !workspaceId) return { error: "Workspace is required" } as const

  const [workspace, superAdmin] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
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

  if (!workspace) return { error: "Workspace not found" } as const
  const role = workspace.members[0]?.role
  if (!superAdmin && workspace.owner_id !== userId && role !== "owner" && role !== "admin") {
    return { error: "Workspace admin access required" } as const
  }

  return { userId, workspace } as const
}

async function notifyUser(userId: string, title: string, body: string, entityId: string) {
  await prisma.notification.create({
    data: {
      user_id: userId,
      type: "admin_access",
      title,
      body,
      related_entity_type: "admin_access_request",
      related_entity_id: entityId,
    },
  })
}

export async function submitSuperAdminRequest(data: { workspaceId?: string | null; note?: string }) {
  const userId = await getSessionUserId()
  if (!userId) return { error: "Unauthorized" }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { is_super_admin: true },
  })

  if (currentUser?.is_super_admin) {
    return { error: "You already have super admin access" }
  }

  if (data.workspaceId) {
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: data.workspaceId,
        members: { some: { user_id: userId } },
      },
      select: { id: true },
    })
    if (!workspace) return { error: "Workspace not found or access denied" }
  }

  const existingPending = await prisma.adminAccessRequest.findFirst({
    where: {
      user_id: userId,
      status: "pending",
      requested_role: "super_admin",
    },
    select: { id: true },
  })

  if (existingPending) {
    return { error: "You already have a pending upgrade request" }
  }

  const request = await prisma.adminAccessRequest.create({
    data: {
      user_id: userId,
      workspace_id: data.workspaceId || null,
      requested_role: "super_admin",
      note: data.note?.trim() || null,
    },
  })

  const superAdmins = await prisma.user.findMany({
    where: { is_super_admin: true },
    select: { id: true },
  })

  await Promise.all(
    superAdmins.map((admin) =>
      notifyUser(admin.id, "New super admin request", "A user requested elevated access.", request.id)
    )
  )

  revalidatePath("/account")
  revalidatePath("/admin/members")
  revalidatePath("/", "layout")
  return { success: true }
}

export async function reviewSuperAdminRequest(data: { requestId: string; decision: "approved" | "rejected"; note?: string }) {
  const reviewerId = await requireSuperAdmin()

  const request = await prisma.adminAccessRequest.findUnique({
    where: { id: data.requestId },
    select: {
      id: true,
      user_id: true,
      workspace_id: true,
      status: true,
    },
  })

  if (!request) return { error: "Request not found" }
  if (request.status !== "pending") return { error: "Request already reviewed" }

  await prisma.$transaction(async (tx) => {
    await tx.adminAccessRequest.update({
      where: { id: request.id },
      data: {
        status: data.decision,
        reviewed_by: reviewerId,
        review_note: data.note?.trim() || null,
        reviewed_at: new Date(),
      },
    })

    if (data.decision === "approved") {
      await tx.user.update({
        where: { id: request.user_id },
        data: { is_super_admin: true },
      })

      if (request.workspace_id) {
        const membership = await tx.workspaceMember.findFirst({
          where: { workspace_id: request.workspace_id, user_id: request.user_id },
          select: { id: true, role: true },
        })

        if (membership && membership.role !== "owner" && membership.role !== "admin") {
          await tx.workspaceMember.update({
            where: { id: membership.id },
            data: { role: "admin" },
          })
        }
      }
    }
  })

  await notifyUser(
    request.user_id,
    data.decision === "approved" ? "Super admin request approved" : "Super admin request rejected",
    data.decision === "approved"
      ? "Your account now has super admin access."
      : data.note?.trim() || "Your super admin request was rejected.",
    request.id
  )

  revalidatePath("/account")
  revalidatePath("/admin/members")
  revalidatePath("/", "layout")
  return { success: true }
}

export async function updateWorkspaceMemberRole(data: { workspaceId: string; userId: string; role: string }) {
  if (!isWorkspaceMemberRole(data?.role)) return { error: "Invalid workspace role" }
  const authorization = await getWorkspaceAdminContext(data?.workspaceId)
  if ("error" in authorization) return authorization
  const { workspace } = authorization

  if (workspace.owner_id === data.userId) return { error: "Workspace owner role cannot be changed" }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspace_id: data.workspaceId, user_id: data.userId },
    select: { id: true, role: true },
  })

  if (!membership) return { error: "Membership not found" }
  if (membership.role === "owner") return { error: "Workspace owner role cannot be changed" }

  await prisma.workspaceMember.update({
    where: { id: membership.id },
    data: { role: data.role },
  })

  await notifyUser(data.userId, "Workspace role updated", `Your role in ${workspace.name} is now ${data.role}.`, membership.id)

  revalidatePath("/account")
  revalidatePath("/admin/members")
  revalidatePath("/", "layout")
  return { success: true }
}

export async function removeWorkspaceMember(data: { workspaceId: string; userId: string }) {
  const authorization = await getWorkspaceAdminContext(data?.workspaceId)
  if ("error" in authorization) return authorization
  const { workspace } = authorization

  if (workspace.owner_id === data.userId) return { error: "Workspace owner cannot be removed" }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspace_id: data.workspaceId, user_id: data.userId },
    select: { id: true, role: true },
  })

  if (!membership) return { error: "Membership not found" }
  if (membership.role === "owner") return { error: "Workspace owner cannot be removed" }

  await prisma.$transaction(async (tx) => {
    const ownedProjects = await tx.project.findMany({
      where: { workspace_id: data.workspaceId, owner_id: data.userId },
      select: { id: true },
    })

    if (ownedProjects.length > 0) {
      await tx.project.updateMany({
        where: { id: { in: ownedProjects.map((project) => project.id) } },
        data: { owner_id: workspace.owner_id },
      })

      for (const project of ownedProjects) {
        await tx.projectMember.upsert({
          where: {
            project_id_user_id: {
              project_id: project.id,
              user_id: workspace.owner_id,
            },
          },
          create: {
            project_id: project.id,
            user_id: workspace.owner_id,
            role: "owner",
          },
          update: { role: "owner" },
        })
      }
    }

    await tx.workspaceMember.delete({ where: { id: membership.id } })

    const teams = await tx.team.findMany({
      where: { workspace_id: data.workspaceId },
      select: { id: true },
    })

    await tx.teamMember.deleteMany({
      where: {
        user_id: data.userId,
        team_id: { in: teams.map((team) => team.id) },
      },
    })

    const projects = await tx.project.findMany({
      where: { workspace_id: data.workspaceId },
      select: { id: true },
    })

    await tx.projectMember.deleteMany({
      where: {
        user_id: data.userId,
        project_id: { in: projects.map((project) => project.id) },
      },
    })
  })

  await notifyUser(data.userId, "Removed from workspace", `You were removed from ${workspace.name}.`, membership.id)
  revalidatePath("/account")
  revalidatePath("/admin/members")
  revalidatePath("/", "layout")
  return { success: true }
}

export async function addWorkspaceMember(data: {
  workspaceId: string
  fullName: string
  email: string
  role: string
  password?: string
}) {
  try {
    if (!isWorkspaceMemberRole(data?.role)) return { error: "Invalid workspace role" }
    const authorization = await getWorkspaceAdminContext(data?.workspaceId)
    if ("error" in authorization) return authorization

    const fullName = typeof data.fullName === "string" ? data.fullName.trim() : ""
    const email = typeof data.email === "string" ? data.email.toLowerCase().trim() : ""
    if (!fullName || !email) {
      return { error: "Missing required fields" }
    }
    
    // 1. Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      // 2. Create user if they don't exist
      const password = data.password || Math.random().toString(36).slice(-10)
      const { hash } = await import("bcryptjs")
      const password_hash = await hash(password, 10)

      user = await prisma.user.create({
        data: {
          email,
          full_name: fullName,
          password_hash,
        },
      })
    }

    // 3. Create or update workspace membership
    const existingMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: data.workspaceId,
          user_id: user.id,
        },
      },
    })

    if (existingMembership) {
      return { error: "User is already a member of this workspace" }
    }

    const membership = await prisma.workspaceMember.create({
      data: {
        workspace_id: data.workspaceId,
        user_id: user.id,
        role: data.role,
      },
      include: { workspace: true },
    })

    await notifyUser(
      user.id,
      "Added to workspace",
      `You were added to ${membership.workspace.name} as ${data.role}.`,
      membership.id
    )

    revalidatePath("/account")
    revalidatePath("/admin/members")
    revalidatePath("/", "layout")
    return { success: true }
  } catch (error: unknown) {
    console.error("Failed to add workspace member:", error)
    return { error: error instanceof Error ? error.message : "Failed to add user" }
  }
}
