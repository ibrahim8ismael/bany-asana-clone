import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export type WorkspaceAccessLevel = "view" | "write" | "admin"
export type ProjectAccessLevel = "view" | "comment" | "edit" | "manage"

function workspaceLevelForProjectLevel(level: ProjectAccessLevel): WorkspaceAccessLevel {
  if (level === "manage") return "admin"
  if (level === "comment" || level === "edit") return "write"
  return "view"
}

export async function isSuperAdminUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { is_super_admin: true },
  })

  return Boolean(user?.is_super_admin)
}

const WORKSPACE_VIEW_ROLES = ["owner", "admin", "member", "guest"] as const
const WORKSPACE_WRITE_ROLES = ["owner", "admin", "member"] as const
const WORKSPACE_ADMIN_ROLES = ["owner", "admin"] as const

const PROJECT_VIEW_ROLES = ["owner", "admin", "editor", "commenter", "viewer"] as const
const PROJECT_COMMENT_ROLES = ["owner", "admin", "editor", "commenter"] as const
const PROJECT_EDIT_ROLES = ["owner", "admin", "editor"] as const
const PROJECT_MANAGE_ROLES = ["owner", "admin"] as const
const TEAM_VIEW_ROLES = ["owner", "member"] as const

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

export function workspaceAccessWhere(
  userId: string,
  level: WorkspaceAccessLevel = "view"
): Prisma.WorkspaceWhereInput {
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
  level: ProjectAccessLevel = "view"
): Prisma.ProjectWhereInput {
  const projectRoles = projectRolesFor(level)
  const workspaceAdminMembership = {
    workspace: {
      members: {
        some: {
          user_id: userId,
          role: { in: [...WORKSPACE_ADMIN_ROLES] },
        },
      },
    },
  } satisfies Prisma.ProjectWhereInput

  const baseRules: Prisma.ProjectWhereInput[] = [
    { owner_id: userId },
    { workspace: { owner_id: userId } },
    workspaceAdminMembership,
    {
      members: {
        some: {
          user_id: userId,
          role: { in: [...projectRoles] },
        },
      },
    },
  ]

  if (level === "view") {
    baseRules.push(
      {
        privacy: "workspace_visible",
        workspace: {
          members: {
            some: {
              user_id: userId,
              role: { in: [...WORKSPACE_VIEW_ROLES] },
            },
          },
        },
      },
      {
        privacy: "team_visible",
        team: {
          members: {
            some: {
              user_id: userId,
              role: { in: [...TEAM_VIEW_ROLES] },
            },
          },
        },
      }
    )
  }

  return { OR: baseRules }
}

export function taskAccessWhere(
  userId: string,
  level: ProjectAccessLevel = "view"
): Prisma.TaskWhereInput {
  const projectLevel = level === "view" ? "view" : level === "comment" ? "comment" : level === "edit" ? "edit" : "manage"
  const workspaceLevel = workspaceLevelForProjectLevel(level)

  const rules: Prisma.TaskWhereInput[] = [
      {
        project: projectAccessWhere(userId, projectLevel),
      },
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
    rules.push({ reviewer_id: userId, quality_required: true })
  }

  return { OR: rules }
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
  return prisma.project.findFirst({
    where: {
      id: projectId,
      ...projectAccessWhere(userId, level),
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
  return prisma.client.findFirst({
    where: {
      id: clientId,
      workspace: workspaceAccessWhere(userId, level),
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
  return prisma.section.findFirst({
    where: {
      id: sectionId,
      OR: [
        { user_id: userId },
        {
          project: {
            ...projectAccessWhere(userId, level === "view" ? "view" : level),
          },
        },
      ],
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
  level: ProjectAccessLevel = "view"
): Promise<TaskAccessContext | null> {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      ...taskAccessWhere(userId, level),
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

export async function getActiveWorkspaceForUser(userId: string): Promise<{
  id: string
  name: string
  slug: string
  owner_id: string
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active_workspace_id: true },
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
        ...workspaceAccessWhere(userId, "view"),
      },
      select: workspaceSelect,
    })

    if (activeWorkspace) return activeWorkspace
  }

  const fallbackWorkspace = await prisma.workspace.findFirst({
    where: workspaceAccessWhere(userId, "view"),
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
}

export async function getUserWorkspaceIds(userId: string): Promise<string[]> {
  const workspaces = await prisma.workspace.findMany({
    where: workspaceAccessWhere(userId, "view"),
    select: { id: true },
  })

  return workspaces.map((workspace) => workspace.id)
}

export async function canAccessWorkspace(userId: string, workspaceId: string, level: WorkspaceAccessLevel = "view") {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      ...workspaceAccessWhere(userId, level),
    },
    select: { id: true },
  })

  return Boolean(workspace)
}

export async function canAccessClient(userId: string, clientId: string, level: WorkspaceAccessLevel = "view") {
  return Boolean(await getAccessibleClientContext(userId, clientId, level))
}

export async function canAccessProject(userId: string, projectId: string, level: ProjectAccessLevel = "view") {
  return Boolean(await getAccessibleProjectContext(userId, projectId, level))
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
