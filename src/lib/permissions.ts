import { cache } from "react"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { PROJECT_MEMBER_ROLES, WORKSPACE_ROLES, type ProjectRole, type WorkspaceRole } from "@/lib/project-membership"

export type WorkspaceAccessLevel = "view" | "write" | "admin"
export type ProjectAccessLevel = "view" | "comment" | "edit" | "manage"

function workspaceLevelForProjectLevel(level: ProjectAccessLevel): WorkspaceAccessLevel {
  if (level === "manage") return "admin"
  if (level === "comment" || level === "edit") return "write"
  return "view"
}

export const isSuperAdminUser = cache(async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { is_super_admin: true },
  })

  return Boolean(user?.is_super_admin)
})

const WORKSPACE_VIEW_ROLES: readonly WorkspaceRole[] = WORKSPACE_ROLES
const WORKSPACE_WRITE_ROLES: readonly WorkspaceRole[] = WORKSPACE_ROLES
const WORKSPACE_ADMIN_ROLES: readonly WorkspaceRole[] = ["owner", "admin"]

const PROJECT_VIEW_ROLES = PROJECT_MEMBER_ROLES
const PROJECT_COMMENT_ROLES = PROJECT_MEMBER_ROLES
const PROJECT_EDIT_ROLES = PROJECT_MEMBER_ROLES
const PROJECT_MANAGE_ROLES = ["admin"] as const

function workspaceRolesFor(level: WorkspaceAccessLevel) {
  switch (level) {
    case "admin":
      return WORKSPACE_ADMIN_ROLES
    case "write":
      return WORKSPACE_WRITE_ROLES
    default:
      return WORKSPACE_VIEW_ROLES
  }
}

function projectRolesFor(level: ProjectAccessLevel) {
  switch (level) {
    case "manage":
      return PROJECT_MANAGE_ROLES
    case "edit":
      return PROJECT_EDIT_ROLES
    case "comment":
      return PROJECT_COMMENT_ROLES
    default:
      return PROJECT_VIEW_ROLES
  }
}

export function projectRoleGrantsAccess({
  role,
  isOwner = false,
  isSuperAdmin = false,
  level = "view",
}: {
  role: ProjectRole | null
  isOwner?: boolean
  isSuperAdmin?: boolean
  level?: ProjectAccessLevel
}) {
  const allowedRoles = projectRolesFor(level) as readonly ProjectRole[]
  return isSuperAdmin || isOwner || (role !== null && allowedRoles.includes(role))
}

export function requiredTaskUpdateAccess(input: {
  title?: unknown
  description_rich_text?: unknown
  status?: unknown
  priority?: unknown
  due_date?: unknown
  assignee_id?: unknown
  project_id?: unknown
  client_id?: unknown
  section_id?: unknown
}): ProjectAccessLevel {
  const changesAdministration = input.assignee_id !== undefined
    || input.project_id !== undefined
    || input.client_id !== undefined
    || input.section_id !== undefined
  return changesAdministration ? "manage" : "edit"
}

export function workspaceAccessWhere(
  userId: string,
  level: WorkspaceAccessLevel = "view",
  isSuperAdmin = false,
): Prisma.WorkspaceWhereInput {
  if (isSuperAdmin) return {}

  const roles = workspaceRolesFor(level)

  return {
    OR: [
      { owner_id: userId },
      {
        members: {
          some: {
            user_id: userId,
            role: { in: [...roles] },
          },
        },
      },
    ],
  }
}

export function projectAccessWhere(
  userId: string,
  level: ProjectAccessLevel = "view",
  isSuperAdmin = false,
): Prisma.ProjectWhereInput {
  if (isSuperAdmin) return {}

  const projectRoles = projectRolesFor(level)
  return {
    workspace: {
      active_users: { some: { id: userId } },
      members: { some: { user_id: userId, role: { in: [...WORKSPACE_VIEW_ROLES] } } },
    },
    OR: [
      { owner_id: userId },
      {
        members: {
          some: {
            user_id: userId,
            role: { in: [...projectRoles] },
          },
        },
      },
    ],
  }
}

export function taskAccessWhere(
  userId: string,
  level: ProjectAccessLevel = "view",
  isSuperAdmin = false
): Prisma.TaskWhereInput {
  if (isSuperAdmin) return {}

  const workspaceLevel = workspaceLevelForProjectLevel(level)

  const rules: Prisma.TaskWhereInput[] = [
    projectTaskAccessWhere(userId, level),
    {
      project_id: null,
      client: {
        workspace: workspaceAccessWhere(userId, workspaceLevel),
      },
    },
    {
      project_id: null,
      client_id: null,
      OR: [{ assignee_id: userId }, { creator_id: userId }],
    },
  ]

  if (level === "view" || level === "comment") {
    rules.push({ project_id: null, reviewer_id: userId, quality_required: true })
  }

  return { OR: rules }
}

export function projectTaskAccessWhere(
  userId: string,
  level: ProjectAccessLevel = "view",
): Prisma.TaskWhereInput {
  return {
    project_id: { not: null },
    project: projectAccessWhere(userId, level),
  }
}

export interface ProjectAccessContext {
  id: string
  workspace_id: string
  client_id: string | null
  team_id: string | null
  privacy: string
  owner_id: string
}

export interface ClientAccessContext {
  id: string
  workspace_id: string
  name: string
  color: string | null
  archived: boolean
}

export interface SectionAccessContext {
  id: string
  name: string
  project_id: string | null
  user_id: string | null
  project: {
    id: string
    workspace_id: string
    client_id: string | null
  } | null
}

export interface TaskAccessContext {
  id: string
  workspace_id: string
  project_id: string | null
  client_id: string | null
  parent_task_id: string | null
  section_id: string | null
  assignee_id: string | null
  creator_id: string
  project: {
    id: string
    workspace_id: string
  } | null
  client: {
    id: string
    workspace_id: string
  } | null
  section: {
    id: string
    project_id: string | null
    user_id: string | null
  } | null
}

export async function getAccessibleProjectContext(
  userId: string,
  projectId: string,
  level: ProjectAccessLevel = "view"
): Promise<ProjectAccessContext | null> {
  const isSuperAdmin = await isSuperAdminUser(userId)

  return prisma.project.findFirst({
    where: {
      id: projectId,
      ...projectAccessWhere(userId, level, isSuperAdmin),
    },
    select: {
      id: true,
      workspace_id: true,
      client_id: true,
      team_id: true,
      privacy: true,
      owner_id: true,
    },
  })
}

export async function getAccessibleClientContext(
  userId: string,
  clientId: string,
  level: WorkspaceAccessLevel = "view"
): Promise<ClientAccessContext | null> {
  const isSuperAdmin = await isSuperAdminUser(userId)

  return prisma.client.findFirst({
    where: {
      id: clientId,
      workspace: workspaceAccessWhere(userId, level, isSuperAdmin),
    },
    select: {
      id: true,
      workspace_id: true,
      name: true,
      color: true,
      archived: true,
    },
  })
}

export async function getAccessibleSectionContext(
  userId: string,
  sectionId: string,
  level: Extract<ProjectAccessLevel, "view" | "edit" | "manage"> = "view"
): Promise<SectionAccessContext | null> {
  const isSuperAdmin = await isSuperAdminUser(userId)

  return prisma.section.findFirst({
    where: {
      id: sectionId,
      ...(isSuperAdmin ? {} : {
        OR: [
          { user_id: userId },
          {
            project: {
              ...projectAccessWhere(userId, level === "view" ? "view" : level),
            },
          },
        ],
      }),
    },
    select: {
      id: true,
      name: true,
      project_id: true,
      user_id: true,
      project: {
        select: {
          id: true,
          workspace_id: true,
          client_id: true,
        },
      },
    },
  })
}

export async function getAccessibleTaskContext(
  userId: string,
  taskId: string,
  level: ProjectAccessLevel = "view",
): Promise<TaskAccessContext | null> {
  const isSuperAdmin = await isSuperAdminUser(userId)

  return prisma.task.findFirst({
    where: {
      id: taskId,
      ...taskAccessWhere(userId, level, isSuperAdmin),
    },
    select: {
      id: true,
      workspace_id: true,
      project_id: true,
      client_id: true,
      parent_task_id: true,
      section_id: true,
      assignee_id: true,
      creator_id: true,
      project: {
        select: {
          id: true,
          workspace_id: true,
        },
      },
      client: {
        select: {
          id: true,
          workspace_id: true,
        },
      },
      section: {
        select: {
          id: true,
          project_id: true,
          user_id: true,
        },
      },
    },
  })
}

export async function getDefaultWorkspaceForUser(userId: string): Promise<{ id: string } | null> {
  return getActiveWorkspaceForUser(userId)
}

export const getActiveWorkspaceForUser = cache(async (userId: string): Promise<{
  id: string
  name: string
  slug: string
  owner_id: string
} | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active_workspace_id: true, is_super_admin: true },
  })

  if (!user) return null

  const workspaceSelect = {
    id: true,
    name: true,
    slug: true,
    owner_id: true,
  } satisfies Prisma.WorkspaceSelect

  if (user.active_workspace_id) {
    const activeWorkspace = await prisma.workspace.findFirst({
      where: {
        id: user.active_workspace_id,
        ...workspaceAccessWhere(userId, "view", user.is_super_admin),
      },
      select: workspaceSelect,
    })

    if (activeWorkspace) return activeWorkspace
  }

  const fallbackWorkspace = await prisma.workspace.findFirst({
    where: workspaceAccessWhere(userId, "view", user.is_super_admin),
    select: workspaceSelect,
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  })

  if (user.active_workspace_id !== (fallbackWorkspace?.id ?? null)) {
    await prisma.user.update({
      where: { id: userId },
      data: { active_workspace_id: fallbackWorkspace?.id ?? null },
    })
  }

  return fallbackWorkspace
})

export async function getUserWorkspaceIds(userId: string): Promise<string[]> {
  const isSuperAdmin = await isSuperAdminUser(userId)
  const workspaces = await prisma.workspace.findMany({
    where: workspaceAccessWhere(userId, "view", isSuperAdmin),
    select: { id: true },
  })

  return workspaces.map((workspace) => workspace.id)
}

export async function canAccessWorkspace(userId: string, workspaceId: string, level: WorkspaceAccessLevel = "view") {
  const isSuperAdmin = await isSuperAdminUser(userId)
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      ...workspaceAccessWhere(userId, level, isSuperAdmin),
    },
    select: { id: true },
  })

  return Boolean(workspace)
}

export async function canManageWorkspace(userId: string, workspaceId: string) {
  return canAccessWorkspace(userId, workspaceId, "admin")
}

export async function canAccessClient(userId: string, clientId: string, level: WorkspaceAccessLevel = "view") {
  return Boolean(await getAccessibleClientContext(userId, clientId, level))
}

export async function canAccessProject(userId: string, projectId: string, level: ProjectAccessLevel = "view") {
  return Boolean(await getAccessibleProjectContext(userId, projectId, level))
}

export async function canManageProject(userId: string, projectId: string) {
  return canAccessProject(userId, projectId, "manage")
}

export async function canManageProjectMembers(userId: string, projectId: string) {
  return canManageProject(userId, projectId)
}

export async function canTransferProjectOwnership(userId: string, projectId: string) {
  const context = await getAccessibleProjectContext(userId, projectId, "manage")
  if (!context) return false
  return (await isSuperAdminUser(userId)) || context.owner_id === userId
}

export async function canAccessSection(
  userId: string,
  sectionId: string,
  level: Extract<ProjectAccessLevel, "view" | "edit" | "manage"> = "view"
) {
  return Boolean(await getAccessibleSectionContext(userId, sectionId, level))
}

export async function canAccessTask(userId: string, taskId: string, level: ProjectAccessLevel = "view") {
  return Boolean(await getAccessibleTaskContext(userId, taskId, level))
}
