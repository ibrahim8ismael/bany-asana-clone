import type { Prisma } from "@prisma/client"
import type { WorkspaceRole } from "@/lib/project-membership"

export type ClientTaskArchiveScope = "active" | "archived"

/**
 * The one canonical definition of task membership in a client.
 *
 * Direct client work, primary project work, and multi-homed project links are
 * all valid ways for a task to belong to a client. Authorization is applied
 * separately by the caller.
 */
export function clientTaskMembershipWhere(clientId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { client_id: clientId },
      { project: { client_id: clientId } },
      { task_links: { some: { project: { client_id: clientId } } } },
    ],
  }
}

export function clientTaskScopeWhere(input: {
  clientId: string
  workspaceId: string
  archiveScope?: ClientTaskArchiveScope
  topLevelOnly?: boolean
}): Prisma.TaskWhereInput {
  return {
    workspace_id: input.workspaceId,
    ...(input.topLevelOnly === false ? {} : { parent_task_id: null }),
    ...(input.archiveScope ? { archived: input.archiveScope === "archived" } : {}),
    AND: [clientTaskMembershipWhere(input.clientId)],
  }
}

export function canInspectAllClientTasks(input: {
  userId: string
  workspaceOwnerId: string
  workspaceRole: WorkspaceRole | null
  isSuperAdmin?: boolean
}) {
  return Boolean(
    input.isSuperAdmin
    || input.workspaceOwnerId === input.userId
    || input.workspaceRole === "owner"
    || input.workspaceRole === "admin"
  )
}
