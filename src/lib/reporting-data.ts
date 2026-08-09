import type { Prisma } from "@prisma/client"
import { buildReportingMetrics, resolveReportingFilters, type ReportingFilters, type ReportingMetrics, type ReportingParamsLike, type ReportingTaskInput } from "@/lib/reporting-metrics"
import { getActiveWorkspaceForUser, isSuperAdminUser, projectAccessWhere, taskAccessWhere, workspaceAccessWhere } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

export interface ReportingFilterOption {
  id: string
  name: string
  color: string | null
  clientId?: string | null
  clientName?: string | null
}

export interface ReportingData extends ReportingMetrics {
  filters: ReportingFilters
  user: {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
    is_super_admin: boolean
  }
  workspace: {
    id: string
    name: string
  } | null
  workspaceRole: string
  isManager: boolean
  pendingRequests: number
  filterOptions: {
    clients: ReportingFilterOption[]
    projects: ReportingFilterOption[]
  }
}

const taskSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  due_date: true,
  completed_at: true,
  created_at: true,
  updated_at: true,
  assignee_id: true,
  quality_required: true,
  quality_state: true,
  first_submitted_at: true,
  quality_score: true,
  first_quality_grade: true,
  final_quality_grade: true,
  review_cycle_count: true,
  rework_count: true,
  quality_blocker_count: true,
  assignee: {
    select: {
      id: true,
      full_name: true,
      email: true,
      avatar_url: true,
    },
  },
  project: {
    select: {
      id: true,
      name: true,
      color: true,
      status: true,
      deadline: true,
      client_id: true,
      client: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
  },
  client: {
    select: {
      id: true,
      name: true,
      color: true,
    },
  },
  section: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.TaskSelect

function taskWhereForReport(userId: string, filters: ReportingFilters, isManager: boolean, workspaceId: string, isSuperAdmin = false) {
  const filtersWhere: Prisma.TaskWhereInput = {
    archived: false,
    workspace_id: workspaceId,
  }

  if (filters.scope !== "team" || !isManager) {
    filtersWhere.assignee_id = userId
  }

  if (filters.status !== "all") {
    filtersWhere.status = filters.status
  }

  if (filters.priority !== "all") {
    filtersWhere.priority = filters.priority === "none" ? null : filters.priority
  }

  if (filters.projectId) {
    filtersWhere.project_id = filters.projectId
  } else if (filters.clientId) {
    filtersWhere.OR = [
      { client_id: filters.clientId },
      { project: { client_id: filters.clientId } },
    ]
  }

  return {
    AND: [taskAccessWhere(userId, "view", isSuperAdmin), filtersWhere],
  } satisfies Prisma.TaskWhereInput
}

function goalWhereForReport(userId: string, filters: ReportingFilters, workspaceId: string) {
  const where: Prisma.GoalWhereInput = { workspace_id: workspaceId }

  if (filters.scope !== "team") {
    where.owner_id = userId
  }

  return where
}

function timeEntryWhereForReport(userId: string, filters: ReportingFilters, workspaceId: string, isSuperAdmin = false) {
  const where: Prisma.TimeEntryWhereInput = {
    date: {
      gte: filters.start,
      lte: filters.end,
    },
    task: {
      AND: [taskAccessWhere(userId, "view", isSuperAdmin), { workspace_id: workspaceId }],
    },
  }

  if (filters.scope !== "team") {
    where.user_id = userId
  }

  return where
}

export async function getReportingData(userId: string, params: ReportingParamsLike): Promise<ReportingData | null> {
  const requestedFilters = resolveReportingFilters(params)
  const [user, activeWorkspace] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        full_name: true,
        email: true,
        avatar_url: true,
        is_super_admin: true,
      },
    }),
    getActiveWorkspaceForUser(userId),
  ])

  if (!user) return null

  const membership = activeWorkspace ? await prisma.workspaceMember.findUnique({
    where: {
      workspace_id_user_id: {
        workspace_id: activeWorkspace.id,
        user_id: userId,
      },
    },
    select: { role: true },
  }) : null
  const workspace = activeWorkspace ? { id: activeWorkspace.id, name: activeWorkspace.name } : null
  const workspaceId = workspace?.id || null
  const workspaceRole = activeWorkspace?.owner_id === userId ? "owner" : membership?.role || "guest"
  const isManager = user.is_super_admin || workspaceRole === "owner" || workspaceRole === "admin"
  const filters: ReportingFilters = requestedFilters.scope === "team" && !isManager
    ? { ...requestedFilters, scope: "personal" }
    : requestedFilters

  const projectOptionWhere: Prisma.ProjectWhereInput = {
    AND: [
      projectAccessWhere(userId, "view", user.is_super_admin),
      { archived: false },
      {
        OR: [
          { client_id: null },
          { client: { archived: false } },
        ],
      },
      ...(workspaceId ? [{ workspace_id: workspaceId }] : []),
    ],
  }

  const [tasks, goals, timeEntries, clients, projects, teamMembers, pendingRequests] = await Promise.all([
    workspaceId ? prisma.task.findMany({
      where: taskWhereForReport(userId, filters, isManager, workspaceId, user.is_super_admin),
      select: taskSelect,
      orderBy: [{ due_date: "asc" }, { updated_at: "desc" }],
    }) as Promise<ReportingTaskInput[]> : Promise.resolve([] as ReportingTaskInput[]),
    workspaceId ? prisma.goal.findMany({
      where: goalWhereForReport(userId, filters, workspaceId),
      select: {
        id: true,
        name: true,
        status: true,
        target_value: true,
        current_value: true,
        due_date: true,
      },
      orderBy: { created_at: "desc" },
      take: 12,
    }) : Promise.resolve([]),
    workspaceId ? prisma.timeEntry.findMany({
      where: timeEntryWhereForReport(userId, filters, workspaceId, user.is_super_admin),
      select: {
        minutes: true,
        date: true,
      },
    }) : Promise.resolve([]),
    workspaceId
      ? prisma.client.findMany({
          where: {
            workspace_id: workspaceId,
            archived: false,
            workspace: workspaceAccessWhere(userId, "view", user.is_super_admin),
          },
          select: {
            id: true,
            name: true,
            color: true,
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    workspaceId ? prisma.project.findMany({
      where: projectOptionWhere,
      select: {
        id: true,
        name: true,
        color: true,
        client_id: true,
        client: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ updated_at: "desc" }, { name: "asc" }],
    }) : Promise.resolve([]),
    isManager && workspaceId
      ? prisma.workspaceMember.findMany({
          where: {
            workspace_id: workspaceId,
            role: { not: "guest" },
          },
          select: {
            role: true,
            user: {
              select: {
                id: true,
                full_name: true,
                email: true,
                avatar_url: true,
              },
            },
          },
          orderBy: { joined_at: "asc" },
        })
      : Promise.resolve([]),
    user.is_super_admin
      ? prisma.adminAccessRequest.count({ where: { status: "pending" } })
      : Promise.resolve(0),
  ])

  const metrics = buildReportingMetrics({
    filters,
    tasks,
    goals,
    timeEntries,
    teamMembers,
  })

  return {
    ...metrics,
    filters,
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      avatar_url: user.avatar_url,
      is_super_admin: user.is_super_admin,
    },
    workspace,
    workspaceRole,
    isManager,
    pendingRequests,
    filterOptions: {
      clients: clients.map((client) => ({
        id: client.id,
        name: client.name,
        color: client.color,
      })),
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        color: project.color,
        clientId: project.client_id,
        clientName: project.client?.name || null,
      })),
    },
  }
}
