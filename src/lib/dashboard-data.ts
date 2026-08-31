import type { Prisma } from "@prisma/client"
import { parseActivityMeta } from "@/lib/activity"
import { getActiveWorkspaceForUser, isSuperAdminUser, projectAccessWhere, taskAccessWhere, workspaceAccessWhere } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"
import { DIRECT_CLIENT_TASK_SCOPE } from "@/lib/client-hierarchy"
import { isWorkspaceAdmin } from "@/lib/project-membership"
import { sidebarProjectWhere } from "@/lib/sidebar-data"
import { TASK_CARD_SELECT } from "@/lib/task-card-select"

function taskHref(projectId: string | null | undefined, clientId: string | null | undefined, taskId: string) {
  if (projectId) return `/projects/${projectId}/list?taskId=${taskId}`
  if (clientId) return `/clients?clientId=${clientId}&taskId=${taskId}`
  return `/my-tasks?taskId=${taskId}`
}

export type InboxFeedItem = {
  id: string
  type: "notification" | "comment" | "activity"
  actor: string
  avatar: string | null
  message: string
  body: string | null
  time: Date
  href: string | null
}

export async function getSidebarData(userId: string) {
  const [activeWorkspace, superAdmin] = await Promise.all([
    getActiveWorkspaceForUser(userId),
    isSuperAdminUser(userId),
  ])

  const [accessibleWorkspaces, clients, starredProjects, myTasksBadgeCount] = await Promise.all([
    prisma.workspace.findMany({
      where: workspaceAccessWhere(userId, "view", superAdmin),
      select: {
        id: true,
        name: true,
        slug: true,
        owner_id: true,
        members: {
          where: { user_id: userId },
          select: { role: true },
          take: 1,
        },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    }),
    activeWorkspace ? prisma.client.findMany({
      where: {
        workspace_id: activeWorkspace.id,
        archived: false,
      },
      select: {
        id: true,
        name: true,
        color: true,
        projects: {
          where: sidebarProjectWhere(userId, superAdmin),
          select: { id: true, name: true, color: true, default_view: true },
          orderBy: { updated_at: "desc" },
        },
        _count: {
          select: {
            tasks: {
              where: {
                project_id: null,
                parent_task_id: null,
                archived: false,
              },
            },
          },
        },
      },
      orderBy: [{ updated_at: "desc" }, { name: "asc" }],
    }) : Promise.resolve([]),
    activeWorkspace ? prisma.project.findMany({
      where: {
        workspace_id: activeWorkspace.id,
        archived: false,
        members: { some: { user_id: userId, is_starred: true } },
        ...projectAccessWhere(userId, "view", superAdmin),
      },
      select: {
        id: true,
        name: true,
        color: true,
        default_view: true,
        client: { select: { id: true, name: true } },
      },
      take: 10,
      orderBy: { updated_at: "desc" },
    }) : Promise.resolve([]),
    activeWorkspace ? prisma.task.count({
      where: {
        AND: [
          taskAccessWhere(userId, "view", superAdmin),
          {
            workspace_id: activeWorkspace.id,
            archived: false,
            OR: [
              { reviewer_id: userId, status: "submitted_for_review", quality_state: "submitted" },
              { assignee_id: userId, status: "needs_rework", quality_state: "needs_rework" },
              { assignee_id: null, creator_id: userId, status: "needs_rework", quality_state: "needs_rework" },
            ],
          },
        ],
      },
    }) : Promise.resolve(0),
  ])

  const workspaces = accessibleWorkspaces.map(({ owner_id, members, ...workspace }) => {
    const role = owner_id === userId ? "owner" : members[0]?.role ?? "member"
    return {
      ...workspace,
      role,
      effectiveRole: role,
      canAdmin: Boolean(superAdmin || isWorkspaceAdmin(role)),
    }
  })
  const workspace = workspaces.find((item) => item.id === activeWorkspace?.id) ?? null

  const canViewPeople = Boolean(workspace?.canAdmin || superAdmin)
  let people: Array<{
    id: string
    full_name: string
    email: string
    avatar_url: string | null
    role: string
    incompleteCount: number
  }> = []

  if (canViewPeople && activeWorkspace) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspace_id: activeWorkspace.id },
      select: {
        role: true,
        joined_at: true,
        user: { select: USER_PUBLIC_SELECT },
      },
      orderBy: { joined_at: "asc" },
    })

    const memberIds = members.map((m) => m.user.id)
    const counts = memberIds.length
      ? await prisma.task.groupBy({
          by: ["assignee_id"],
          where: {
            AND: [
              taskAccessWhere(userId, "view", superAdmin),
              {
                workspace_id: activeWorkspace.id,
                archived: false,
                status: { not: "complete" },
                assignee_id: { in: memberIds },
              },
            ],
          },
          _count: { _all: true },
        })
      : []

    const countMap = new Map<string, number>()
    for (const row of counts) {
      if (row.assignee_id) countMap.set(row.assignee_id, row._count._all)
    }

    people = members.map((membership) => ({
      id: membership.user.id,
      full_name: membership.user.full_name,
      email: membership.user.email,
      avatar_url: membership.user.avatar_url,
      role: membership.role,
      incompleteCount: countMap.get(membership.user.id) || 0,
    })).sort((a, b) => a.full_name.localeCompare(b.full_name))
  }

  return {
    workspace,
    workspaces,
    clients: clients.map((client) => ({
      ...client,
      directTaskCount: client._count.tasks,
    })),
    starredProjects,
    canImport: Boolean(superAdmin),
    isSuperAdmin: Boolean(superAdmin),
    myTasksBadgeCount,
    people,
  }
}

export async function getScopedClients(userId: string) {
  const [workspace, superAdmin] = await Promise.all([
    getActiveWorkspaceForUser(userId),
    isSuperAdminUser(userId),
  ])
  if (!workspace) return []

  return prisma.client.findMany({
    where: {
      workspace_id: workspace.id,
    },
    select: {
      id: true,
      workspace_id: true,
      name: true,
      email: true,
      notes: true,
      color: true,
      archived: true,
      archived_at: true,
      created_at: true,
      updated_at: true,
      projects: {
        where: {
          workspace_id: workspace.id,
          archived: false,
          ...projectAccessWhere(userId, "view", superAdmin),
        },
        select: {
          id: true,
          workspace_id: true,
          client_id: true,
          name: true,
          description: true,
          deadline: true,
          status: true,
          color: true,
          default_view: true,
          quality_policy: true,
          default_reviewer_id: true,
          review_sla_days: true,
          sections: {
            select: {
              id: true,
              name: true,
              position: true,
            },
            orderBy: { position: "asc" },
          },
          tasks: {
            where: {
              archived: false,
              parent_task_id: null,
            },
            orderBy: [{ status: "asc" }, { due_date: "asc" }, { created_at: "desc" }],
            take: 200,
            select: TASK_CARD_SELECT,
          },
        },
        orderBy: { updated_at: "desc" },
      },
      tasks: {
        where: {
          ...DIRECT_CLIENT_TASK_SCOPE,
        },
        orderBy: [{ status: "asc" }, { due_date: "asc" }, { created_at: "desc" }],
        take: 200,
        select: TASK_CARD_SELECT,
      },
    },
    orderBy: [{ updated_at: "desc" }, { name: "asc" }],
  })
}

export async function getScopedGoals(userId: string) {
  const workspace = await getActiveWorkspaceForUser(userId)
  if (!workspace) return []

  return prisma.goal.findMany({
    where: {
      workspace_id: workspace.id,
    },
    include: { owner: { select: USER_PUBLIC_SELECT }, team: true },
    orderBy: { created_at: "desc" },
  })
}

export async function getScopedPortfolios(userId: string) {
  const [workspace, superAdmin] = await Promise.all([
    getActiveWorkspaceForUser(userId),
    isSuperAdminUser(userId),
  ])
  if (!workspace) return []

  return prisma.portfolio.findMany({
    where: {
      workspace_id: workspace.id,
    },
    include: {
      owner: { select: USER_PUBLIC_SELECT },
      projects: {
        where: {
          project: {
            workspace_id: workspace.id,
            ...projectAccessWhere(userId, "view", superAdmin),
          },
        },
        include: {
          project: {
            include: {
              tasks: { select: { id: true, status: true } },
            },
          },
        },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { created_at: "desc" },
  })
}

export async function getInboxFeed(userId: string) {
  const [activeWorkspace, superAdmin] = await Promise.all([
    getActiveWorkspaceForUser(userId),
    isSuperAdminUser(userId),
  ])
  const managedProjects = activeWorkspace ? await prisma.project.findMany({
    where: {
      workspace_id: activeWorkspace.id,
      archived: false,
      ...projectAccessWhere(userId, "manage", superAdmin),
    },
    select: { id: true },
  }) : []

  const managedProjectIds = new Set(managedProjects.map((project) => project.id))

  const [notificationRows, recentComments, recentActivity] = await Promise.all([
    prisma.notification.findMany({
      where: {
        user_id: userId,
        OR: [{ snoozed_until: null }, { snoozed_until: { lte: new Date() } }],
      },
      orderBy: { created_at: "desc" },
      take: 24,
    }),
    activeWorkspace ? prisma.comment.findMany({
      where: {
        task: {
          AND: [
            taskAccessWhere(userId, "view", superAdmin),
            { workspace_id: activeWorkspace.id },
          ],
        },
        author_id: { not: userId },
      },
      include: {
        author: { select: USER_PUBLIC_SELECT },
        task: {
          select: {
            id: true,
            title: true,
            project_id: true,
            client_id: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: 12,
    }) : Promise.resolve([]),
    activeWorkspace ? prisma.activityLog.findMany({
      where: {
        workspace_id: activeWorkspace.id,
        workspace: workspaceAccessWhere(userId, "view", superAdmin),
        actor_id: { not: userId },
      },
      include: { actor: { select: USER_PUBLIC_SELECT } },
      orderBy: { created_at: "desc" },
      take: 20,
    }) : Promise.resolve([]),
  ])

  const notificationTaskIds = notificationRows
    .filter((notification) => notification.related_entity_type === "task")
    .map((notification) => notification.related_entity_id)

  const notificationProjectIds = notificationRows
    .filter((notification) => notification.related_entity_type === "project")
    .map((notification) => notification.related_entity_id)

  const activityRows = recentActivity.map((activity) => ({
    activity,
    meta: parseActivityMeta<{ taskId?: string; projectId?: string; clientId?: string }>(activity.meta_json),
  }))
  const activityTaskIds = activityRows.flatMap(({ meta }) => meta?.taskId ? [meta.taskId] : [])
  const activityProjectIds = activityRows.flatMap(({ activity, meta }) => {
    if (meta?.taskId) return []
    if (meta?.projectId) return [meta.projectId]
    return activity.entity_type === "project" ? [activity.entity_id] : []
  })
  const taskIdsToAuthorize = [...new Set([...notificationTaskIds, ...activityTaskIds])]
  const projectIdsToAuthorize = [...new Set([...notificationProjectIds, ...activityProjectIds])]

  const [authorizedTasks, authorizedProjects] = await Promise.all([
    activeWorkspace && taskIdsToAuthorize.length
      ? prisma.task.findMany({
          where: {
            AND: [
              { id: { in: taskIdsToAuthorize } },
              taskAccessWhere(userId, "view", superAdmin),
              { workspace_id: activeWorkspace.id },
            ],
          },
          select: { id: true, project_id: true, client_id: true },
        })
      : Promise.resolve([]),
    activeWorkspace && projectIdsToAuthorize.length
      ? prisma.project.findMany({
          where: {
            id: { in: projectIdsToAuthorize },
            workspace_id: activeWorkspace.id,
            ...projectAccessWhere(userId, "view", superAdmin),
          },
          select: { id: true },
        })
      : Promise.resolve([]),
  ])

  const authorizedTaskMap = new Map(
    authorizedTasks.map((task) => [task.id, { project_id: task.project_id, client_id: task.client_id }])
  )
  const authorizedProjectIds = new Set(authorizedProjects.map((project) => project.id))
  const visibleNotifications = notificationRows.filter((notification) => {
    if (notification.related_entity_type === "task") {
      return authorizedTaskMap.has(notification.related_entity_id)
    }
    if (notification.related_entity_type === "project") {
      return authorizedProjectIds.has(notification.related_entity_id)
    }
    return true
  })

  const notificationItems: InboxFeedItem[] = visibleNotifications.map((notification) => {
    let href: string | null = null

    if (notification.related_entity_type === "task") {
      const task = authorizedTaskMap.get(notification.related_entity_id)
      href = notification.type === "quality_review"
        ? `/my-tasks?taskId=${notification.related_entity_id}`
        : taskHref(task?.project_id || null, task?.client_id || null, notification.related_entity_id)
    } else if (notification.related_entity_type === "project") {
      href = `/projects/${notification.related_entity_id}/overview`
    } else if (notification.related_entity_type === "admin_access_request") {
      href = "/admin/members"
    }

    return {
      id: `notification-${notification.id}`,
      type: "notification",
      actor: notification.title,
      avatar: null,
      message: notification.body,
      body: null,
      time: notification.created_at,
      href,
    }
  })

  const commentItems: InboxFeedItem[] = recentComments.map((comment) => ({
    id: `comment-${comment.id}`,
    type: "comment" as const,
    actor: comment.author.full_name,
    avatar: comment.author.avatar_url,
    message: `commented on ${comment.task.title}`,
    body: comment.body_rich_text,
    time: comment.created_at,
    href: taskHref(comment.task.project_id, comment.task.client_id, comment.task.id),
  }))
    .filter((comment) => !(comment.href.startsWith("/projects/") && managedProjectIds.has(comment.href.split("/")[2] || "")))

  const activityItems: InboxFeedItem[] = activityRows.filter(({ activity, meta }) => {
    if (meta?.taskId) return authorizedTaskMap.has(meta.taskId)
    const projectId = meta?.projectId || (activity.entity_type === "project" ? activity.entity_id : null)
    return projectId ? authorizedProjectIds.has(projectId) : true
  }).map(({ activity, meta }) => {
    const authorizedTask = meta?.taskId ? authorizedTaskMap.get(meta.taskId) : null
    const href = meta?.taskId
      ? taskHref(authorizedTask?.project_id || null, authorizedTask?.client_id || null, meta.taskId)
      : meta?.projectId
        ? `/projects/${meta.projectId}/overview`
        : activity.entity_type === "project"
          ? `/projects/${activity.entity_id}/overview`
          : null

    return {
      id: `activity-${activity.id}`,
      type: "activity" as const,
      actor: activity.actor?.full_name || "System",
      avatar: activity.actor?.avatar_url || null,
      message: activity.action.replace(/_/g, " "),
      body: null,
      time: activity.created_at,
      href,
    }
  }).filter((activity) => !(projectIdForFeedItem(activity.href) && managedProjectIds.has(projectIdForFeedItem(activity.href)!)))

  return [...notificationItems, ...commentItems, ...activityItems]
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .slice(0, 24)
}

function projectIdForFeedItem(href: string | null | undefined) {
  if (!href?.startsWith("/projects/")) return null
  return href.split("/")[2] || null
}

export async function getSearchResults(userId: string, query: string) {
  const term = query.trim()
  if (!term) return { projects: [], tasks: [] }

  const [activeWorkspace, superAdmin] = await Promise.all([
    getActiveWorkspaceForUser(userId),
    isSuperAdminUser(userId),
  ])
  if (!activeWorkspace) return { projects: [], tasks: [] }

  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: {
        AND: [
          projectAccessWhere(userId, "view", superAdmin),
          { workspace_id: activeWorkspace.id },
          { archived: false },
          {
            OR: [
              { name: { contains: term } },
              { description: { contains: term } },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        color: true,
        default_view: true,
        client: { select: { id: true, name: true } },
      },
      take: 8,
      orderBy: { updated_at: "desc" },
    }),
    prisma.task.findMany({
      where: {
        AND: [
          taskAccessWhere(userId, "view", superAdmin),
          {
            workspace_id: activeWorkspace.id,
            archived: false,
            title: { contains: term },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        project_id: true,
        client_id: true,
        due_date: true,
        status: true,
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      take: 12,
      orderBy: { updated_at: "desc" },
    }),
  ])

  return { projects, tasks }
}

export async function getClientDashboardData(userId: string, clientId: string) {
  const [activeWorkspace, superAdmin] = await Promise.all([
    getActiveWorkspaceForUser(userId),
    isSuperAdminUser(userId),
  ])
  if (!activeWorkspace) return null

  return prisma.client.findFirst({
    where: {
      id: clientId,
      workspace_id: activeWorkspace.id,
      workspace: workspaceAccessWhere(userId, "view", superAdmin),
    },
    select: {
      id: true,
      name: true,
      color: true,
      email: true,
      notes: true,
      projects: {
        where: {
          workspace_id: activeWorkspace.id,
          archived: false,
          ...projectAccessWhere(userId, "view", superAdmin),
        },
        select: {
          id: true,
          name: true,
          color: true,
          default_view: true,
          tasks: {
            where: {
              workspace_id: activeWorkspace.id,
              archived: false,
            },
            include: { assignee: { select: USER_PUBLIC_SELECT } },
            orderBy: { due_date: "asc" },
            take: 5,
          },
          _count: {
            select: { tasks: { where: { status: "complete" } } },
          },
          sections: {
            select: { id: true },
          },
        },
        orderBy: { updated_at: "desc" },
      },
    },
  })
}
