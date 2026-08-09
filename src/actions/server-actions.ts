"use server"

import type { Prisma } from "@prisma/client"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { authOptions } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import {
  canAccessWorkspace,
  getAccessibleClientContext,
  getAccessibleProjectContext,
  getAccessibleSectionContext,
  getAccessibleTaskContext,
  getActiveWorkspaceForUser,
  getDefaultWorkspaceForUser,
  projectAccessWhere,
  workspaceAccessWhere,
} from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"
import { parseTaskUpdateInput } from "@/lib/task-input"
import { resolveTaskPlacement } from "@/lib/task-placement"
import { buildProjectCreateData, DEFAULT_PROJECT_SECTION } from "@/lib/project-creation"
import {
  deriveProjectCompletionStatus,
  isProjectStatus,
  isTaskWorkflowStage,
  type TaskWorkflowStageId,
  validateManualTaskTransition,
} from "@/lib/workflow"

const taskInclude = {
  assignee: { select: USER_PUBLIC_SELECT },
  project: true,
  client: true,
  section: true,
  tags: { include: { tag: true } },
  comments: { include: { author: { select: USER_PUBLIC_SELECT } } },
  subtasks: true,
  attachments: true,
} satisfies Prisma.TaskInclude

type TaskHistorySnapshot = {
  title: string
  description_rich_text: string | null
  status: string
  priority: string | null
  start_date: Date | null
  due_date: Date | null
  assignee: { id: string; full_name: string } | null
  project: { id: string; name: string } | null
  client: { id: string; name: string } | null
  section: { id: string; name: string } | null
}

type ProjectHistorySnapshot = {
  id: string
  workspace_id: string
  client_id: string | null
  name: string
  description: string | null
  deadline: Date | null
  status: string
  color: string | null
  default_view: string
}

const PROJECT_MANAGEABLE_ROLES = ["admin", "user"] as const

function isManageableProjectRole(role: string): role is (typeof PROJECT_MANAGEABLE_ROLES)[number] {
  return PROJECT_MANAGEABLE_ROLES.includes(role as (typeof PROJECT_MANAGEABLE_ROLES)[number])
}

async function getSessionUserId() {
  const session = await getServerSession(authOptions)
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error"
}

function formatHistoryDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

async function getTaskHistorySnapshot(taskId: string): Promise<TaskHistorySnapshot | null> {
  return prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      description_rich_text: true,
      status: true,
      priority: true,
      start_date: true,
      due_date: true,
      assignee: { select: { id: true, full_name: true } },
      project: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
    },
  })
}

async function getProjectHistorySnapshot(projectId: string): Promise<ProjectHistorySnapshot | null> {
  return prisma.project.findUnique({
    where: { id: projectId },
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
    },
  })
}

async function logTaskHistoryEntries(
  workspaceId: string,
  actorId: string,
  taskId: string,
  entries: Array<{ action: string; meta?: Record<string, unknown> }>
) {
  const taskAssociations = await prisma.task.findUnique({
    where: { id: taskId },
    select: { project_id: true, client_id: true },
  })

  for (const entry of entries) {
    await logActivity({
      workspaceId,
      actorId,
      entityType: "task",
      entityId: taskId,
      action: entry.action,
      meta: {
        taskId,
        projectId: taskAssociations?.project_id || null,
        clientId: taskAssociations?.client_id || null,
        ...(entry.meta || {}),
      },
    })
  }
}

async function logProjectHistoryEntries(
  workspaceId: string,
  actorId: string,
  projectId: string,
  entries: Array<{ action: string; meta?: Record<string, unknown> }>
) {
  for (const entry of entries) {
    await logActivity({
      workspaceId,
      actorId,
      entityType: "project",
      entityId: projectId,
      action: entry.action,
      meta: {
        projectId,
        ...(entry.meta || {}),
      },
    })
  }
}

function buildTaskUpdateHistoryEntries(before: TaskHistorySnapshot, after: TaskHistorySnapshot) {
  const entries: Array<{ action: string; meta?: Record<string, unknown> }> = []

  if (before.title !== after.title) {
    entries.push({
      action: "task_title_changed",
      meta: { source: "manual", from: before.title, to: after.title },
    })
  }

  if ((before.description_rich_text || "") !== (after.description_rich_text || "")) {
    entries.push({
      action: "task_description_changed",
      meta: {
        source: "manual",
        from: before.description_rich_text ? "Filled" : null,
        to: after.description_rich_text ? "Filled" : null,
      },
    })
  }

  if (before.status !== after.status) {
    if (after.status === "complete") {
      entries.push({ action: "task_completed", meta: { source: "manual" } })
    } else if (before.status === "complete" && after.status !== "complete") {
      entries.push({ action: "task_reopened", meta: { source: "manual" } })
    } else {
      entries.push({
        action: "task_status_changed",
        meta: { source: "manual", from: before.status, to: after.status },
      })
    }
  }

  if ((before.priority || "") !== (after.priority || "")) {
    entries.push({
      action: "task_priority_changed",
      meta: { source: "manual", from: before.priority, to: after.priority },
    })
  }

  if (formatHistoryDate(before.start_date) !== formatHistoryDate(after.start_date)) {
    entries.push({
      action: "task_start_date_changed",
      meta: { source: "manual", from: formatHistoryDate(before.start_date), to: formatHistoryDate(after.start_date) },
    })
  }

  if (formatHistoryDate(before.due_date) !== formatHistoryDate(after.due_date)) {
    entries.push({
      action: "task_due_date_changed",
      meta: { source: "manual", from: formatHistoryDate(before.due_date), to: formatHistoryDate(after.due_date) },
    })
  }

  if ((before.assignee?.id || null) !== (after.assignee?.id || null)) {
    entries.push({
      action: "task_assignee_changed",
      meta: { source: "manual", from: before.assignee?.full_name || null, to: after.assignee?.full_name || null },
    })
  }

  if ((before.project?.id || null) !== (after.project?.id || null)) {
    entries.push({
      action: "task_project_changed",
      meta: { source: "manual", from: before.project?.name || null, to: after.project?.name || null },
    })
  }

  if ((before.client?.id || null) !== (after.client?.id || null)) {
    entries.push({
      action: "task_client_changed",
      meta: { source: "manual", from: before.client?.name || null, to: after.client?.name || null },
    })
  }

  if ((before.section?.id || null) !== (after.section?.id || null)) {
    entries.push({
      action: "task_section_changed",
      meta: { source: "manual", from: before.section?.name || null, to: after.section?.name || null },
    })
  }

  return entries
}

function buildProjectUpdateHistoryEntries(before: ProjectHistorySnapshot, after: ProjectHistorySnapshot) {
  const entries: Array<{ action: string; meta?: Record<string, unknown> }> = []

  if (before.name !== after.name) {
    entries.push({
      action: "project_name_changed",
      meta: { source: "manual", from: before.name, to: after.name },
    })
  }

  if ((before.description || "") !== (after.description || "")) {
    entries.push({
      action: "project_description_changed",
      meta: {
        source: "manual",
        from: before.description ? "Filled" : null,
        to: after.description ? "Filled" : null,
      },
    })
  }

  if (formatHistoryDate(before.deadline) !== formatHistoryDate(after.deadline)) {
    entries.push({
      action: "project_deadline_changed",
      meta: { source: "manual", from: formatHistoryDate(before.deadline), to: formatHistoryDate(after.deadline) },
    })
  }

  if (before.status !== after.status) {
    entries.push({
      action: "project_status_changed",
      meta: { source: "manual", from: before.status, to: after.status },
    })
  }

  return entries
}

function normalizeDueDate(dueDate: Date | string | null | undefined) {
  if (dueDate === undefined) return undefined
  if (dueDate === null || dueDate === "") return null
  if (dueDate instanceof Date) return dueDate

  const parsed = new Date(`${dueDate}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function ensureWorkspaceMember(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspace_id: workspaceId, user_id: userId },
    select: { id: true },
  })

  return Boolean(membership)
}

function getTaskRevalidationPaths(projectId?: string | null, clientId?: string | null) {
  const paths = projectId
    ? [`/projects/${projectId}/list`, `/projects/${projectId}/board`, `/projects/${projectId}/calendar`, `/projects/${projectId}/timeline`, `/projects/${projectId}/overview`, `/projects/${projectId}/dashboard`]
    : ["/my-tasks", "/home"]

  if (projectId || clientId) {
    paths.push("/clients", "/portfolios")
  }

  paths.push("/reporting")

  return [...new Set(paths)]
}

function revalidateMany(paths: string[]) {
  for (const path of paths) {
    revalidatePath(path)
  }
}

function getClientPageRevalidationPaths() {
  return ["/", "/home", "/clients", "/portfolios"]
}

async function syncProjectCompletionState(projectId: string, actorId?: string | null) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
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
      tasks: {
        where: { archived: false },
        select: { status: true },
      },
    },
  })

  if (!project) return null

  const nextStatus = deriveProjectCompletionStatus(
    project.status,
    project.tasks.map((task) => task.status)
  )

  if (nextStatus === project.status) {
    return { project, changed: false as const }
  }

  const updatedProject = await prisma.project.update({
    where: { id: project.id },
    data: { status: nextStatus },
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
    },
  })

  if (actorId) {
    await logProjectHistoryEntries(updatedProject.workspace_id, actorId, updatedProject.id, [
      {
        action: "project_status_changed",
        meta: { source: "automatic", from: project.status, to: updatedProject.status },
      },
    ])
  }

  revalidateMany(getTaskRevalidationPaths(updatedProject.id, updatedProject.client_id))

  return {
    project: updatedProject,
    changed: true as const,
    previousStatus: project.status,
  }
}

export async function updateTaskPosition(
  taskId: string,
  newSectionId: string,
  newPosition: number,
  sourceSectionId: string
) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const [taskContext, destinationSection, sourceSection] = await Promise.all([
      getAccessibleTaskContext(userId, taskId, "edit"),
      getAccessibleSectionContext(userId, newSectionId, "edit"),
      getAccessibleSectionContext(userId, sourceSectionId, "edit"),
    ])

    if (!taskContext || !destinationSection || !sourceSection) {
      return { error: "Not found" }
    }

    const taskProjectId = taskContext.project_id || null
    const sourceProjectId = sourceSection.project_id || null
    const destinationProjectId = destinationSection.project_id || null

    const movingWithinProject = taskProjectId && sourceProjectId === taskProjectId && destinationProjectId === taskProjectId
    const movingWithinPersonalSections = !taskProjectId && sourceSection.user_id === userId && destinationSection.user_id === userId

    if (!movingWithinProject && !movingWithinPersonalSections) {
      return { error: "Invalid section move" }
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        section_id: newSectionId,
        position: newPosition * 1000,
      },
      include: taskInclude,
    })

    await logTaskHistoryEntries(task.workspace_id, userId, task.id, [
      {
        action: "task_moved",
        meta: {
          source: "manual",
          taskId: task.id,
          projectId: task.project_id,
          sourceSectionId,
          destinationSectionId: newSectionId,
          fromSectionName: sourceSection.name,
          toSectionName: destinationSection.name,
        },
      },
    ])

    revalidateMany([
      ...getTaskRevalidationPaths(taskContext.project_id, taskContext.client_id),
      ...getTaskRevalidationPaths(task.project_id, task.client_id),
    ])
    return { success: true, task }
  } catch (error) {
    console.error("Failed to update task position:", error)
    return { error: "Failed to persist position" }
  }
}

export async function createTask(data: {
  title: string
  status?: TaskWorkflowStageId
  section_id?: string
  project_id?: string
  client_id?: string
  workspace_id?: string
  assignee_id?: string
  position?: number
}) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }
    if (!data.title?.trim() || data.title.trim().length > 500) {
      return { error: "Task title must be between 1 and 500 characters" }
    }
    if (data.status !== undefined && !isTaskWorkflowStage(data.status)) {
      return { error: "Unsupported task workflow stage" }
    }

    const [projectContext, sectionContext, clientContext] = await Promise.all([
      data.project_id ? getAccessibleProjectContext(userId, data.project_id, "edit") : Promise.resolve(null),
      data.section_id ? getAccessibleSectionContext(userId, data.section_id, "edit") : Promise.resolve(null),
      data.client_id ? getAccessibleClientContext(userId, data.client_id, "write") : Promise.resolve(null),
    ])

    if (data.project_id && !projectContext) return { error: "Not found" }
    if (data.section_id && !sectionContext) return { error: "Not found" }
    if (data.client_id && !clientContext) return { error: "Not found" }
    if (clientContext?.archived) return { error: "Restore this client before adding new work" }

    const fallbackWorkspaceId = (await getActiveWorkspaceForUser(userId))?.id || null
    const placement = resolveTaskPlacement({
      project: projectContext,
      client: clientContext,
      section: sectionContext,
      fallbackWorkspaceId,
      requestedWorkspaceId: data.workspace_id,
    })
    if (!placement.success) return { error: placement.error }
    const resolvedProjectId = placement.projectId
    const resolvedClientId = placement.clientId
    const resolvedWorkspaceId = placement.workspaceId

    const workspaceAllowed = await canAccessWorkspace(userId, resolvedWorkspaceId, "write")
    if (!workspaceAllowed) return { error: "Not found" }

    if (data.assignee_id) {
      const assigneeAllowed = await ensureWorkspaceMember(resolvedWorkspaceId, data.assignee_id)
      if (!assigneeAllowed) return { error: "Not found" }
    }

    const projectQualityPolicy = resolvedProjectId
      ? await prisma.project.findUnique({ where: { id: resolvedProjectId }, select: { quality_policy: true } })
      : null
    const qualityRequired = projectQualityPolicy?.quality_policy === "required"
    const status = data.status || "incomplete"
    const transitionError = validateManualTaskTransition({
      from: "incomplete",
      to: status,
      qualityRequired,
      qualityState: qualityRequired ? "ready" : "not_required",
    })
    if (status !== "incomplete" && transitionError) return { error: transitionError }

    let resolvedSectionId = placement.sectionId || undefined
    if (!resolvedProjectId && resolvedClientId) {
      resolvedSectionId = undefined
    }

    if (!resolvedSectionId && !resolvedProjectId && !resolvedClientId && data.assignee_id === userId) {
      let recentSection = await prisma.section.findFirst({
        where: { user_id: userId, name: "Recently assigned" },
        select: { id: true }
      })
      if (!recentSection) {
        recentSection = await prisma.section.create({
          data: { name: "Recently assigned", user_id: userId, position: 0 },
          select: { id: true }
        })
      }
      resolvedSectionId = recentSection.id
    }

    let newPosition = 1000
    if (resolvedSectionId) {
      const lastTask = await prisma.task.findFirst({
        where: { section_id: resolvedSectionId },
        orderBy: { position: "desc" },
      })
      newPosition = (lastTask?.position ?? 0) + 1000
    } else if (resolvedClientId && !resolvedProjectId) {
      const lastTask = await prisma.task.findFirst({
        where: {
          client_id: resolvedClientId,
          project_id: null,
          section_id: null,
        },
        orderBy: { position: "desc" },
      })
      newPosition = (lastTask?.position ?? 0) + 1000
    }

    const task = await prisma.task.create({
      data: {
        title: data.title.trim(),
        project_id: resolvedProjectId,
        client_id: resolvedClientId,
        section_id: resolvedSectionId || null,
        workspace_id: resolvedWorkspaceId,
        assignee_id: data.assignee_id,
        creator_id: userId,
        status,
        completed_at: status === "complete" ? new Date() : null,
        quality_required: qualityRequired,
        quality_state: qualityRequired ? "ready" : "not_required",
        position: data.position ?? newPosition,
      },
      include: taskInclude,
    })

    await logTaskHistoryEntries(resolvedWorkspaceId, userId, task.id, [
      {
        action: "task_created",
        meta: {
          source: "manual",
          taskId: task.id,
          projectId: task.project_id,
          sectionId: task.section_id,
          title: task.title,
          assigneeName: task.assignee?.full_name || null,
          sectionName: task.section?.name || null,
          projectName: task.project?.name || null,
          status: task.status,
        },
      },
    ])

    if (task.project_id) {
      await logProjectHistoryEntries(task.workspace_id, userId, task.project_id, [
        {
          action: "project_task_added",
          meta: { source: "manual", taskId: task.id, title: task.title },
        },
      ])
      await syncProjectCompletionState(task.project_id, userId)
    }

    revalidateMany(getTaskRevalidationPaths(task.project_id, task.client_id))
    return { success: true, task }
  } catch (error: unknown) {
    console.error("Failed to create task:", error)
    return { error: getErrorMessage(error) || "Failed to create task" }
  }
}

export async function createClient(data: {
  name: string
  email?: string
  notes?: string
  color?: string
  workspace_id?: string
}) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }
    if (!data.name.trim()) return { error: "Client name is required" }

    let workspaceId = data.workspace_id
    if (!workspaceId) {
      const workspace = await getDefaultWorkspaceForUser(userId)
      if (!workspace) return { error: "Not found" }
      workspaceId = workspace.id
    }

    const allowedWorkspace = await canAccessWorkspace(userId, workspaceId, "write")
    if (!allowedWorkspace) return { error: "Not found" }

    const client = await prisma.client.create({
      data: {
        workspace_id: workspaceId,
        name: data.name,
        email: data.email?.trim() || null,
        notes: data.notes?.trim() || null,
        color: data.color || "#f97316",
      },
    })

    revalidatePath("/")
    revalidatePath("/clients")
    revalidatePath("/portfolios")
    return { success: true, client }
  } catch (error: unknown) {
    console.error("Failed to create client:", error)
    return { error: getErrorMessage(error) || "Failed to create client" }
  }
}

export async function updateClient(data: {
  client_id: string
  name: string
  email?: string
  notes?: string
  color?: string
}) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }
    if (!data.name.trim()) return { error: "Client name is required" }

    const clientContext = await getAccessibleClientContext(userId, data.client_id, "write")
    if (!clientContext) return { error: "Not found" }

    const client = await prisma.client.update({
      where: { id: clientContext.id },
      data: {
        name: data.name.trim(),
        email: data.email?.trim() || null,
        notes: data.notes?.trim() || null,
        color: data.color || null,
      },
    })

    revalidateMany(getClientPageRevalidationPaths())
    return { success: true, client }
  } catch (error: unknown) {
    console.error("Failed to update client:", error)
    return { error: getErrorMessage(error) || "Failed to update client" }
  }
}

export async function setClientArchived(clientId: string, archived: boolean) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const clientContext = await getAccessibleClientContext(userId, clientId, "write")
    if (!clientContext) return { error: "Not found" }

    if (clientContext.archived === archived) {
      const client = await prisma.client.findUnique({ where: { id: clientContext.id } })
      return { success: true, client }
    }

    const client = await prisma.client.update({
      where: { id: clientContext.id },
      data: {
        archived,
        archived_at: archived ? new Date() : null,
      },
    })

    await logActivity({
      workspaceId: clientContext.workspace_id,
      actorId: userId,
      entityType: "client",
      entityId: clientContext.id,
      action: archived ? "client_archived" : "client_restored",
      meta: { clientId: clientContext.id, name: clientContext.name },
    })

    revalidateMany(getClientPageRevalidationPaths())
    revalidatePath("/reporting")
    return { success: true, client }
  } catch (error: unknown) {
    console.error("Failed to update client archive state:", error)
    return { error: getErrorMessage(error) || "Failed to update client archive state" }
  }
}

export async function deleteClient(clientId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const clientContext = await getAccessibleClientContext(userId, clientId, "admin")
    if (!clientContext) return { error: "Not found" }

    const projects = await prisma.project.findMany({
      where: { client_id: clientContext.id },
      select: { id: true },
    })
    const projectIds = projects.map((project) => project.id)
    const taskWhere: Prisma.TaskWhereInput = {
      OR: [
        { client_id: clientContext.id },
        ...(projectIds.length > 0 ? [{ project_id: { in: projectIds } }] : []),
      ],
    }
    const tasksCount = await prisma.task.count({ where: taskWhere })

    await prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({ where: taskWhere })
      await tx.client.delete({ where: { id: clientContext.id } })
    })

    revalidateMany(getClientPageRevalidationPaths())
    return {
      success: true,
      deletedClientId: clientContext.id,
      deletedProjects: projects.length,
      deletedTasks: tasksCount,
    }
  } catch (error: unknown) {
    console.error("Failed to delete client:", error)
    return { error: getErrorMessage(error) || "Failed to delete client" }
  }
}

export async function createProject(data: {
  name: string
  description?: string
  default_view: string
  client_id: string
  workspace_id?: string
  color?: string
  deadline?: Date | string | null
}) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const clientContext = await getAccessibleClientContext(userId, data.client_id, "write")
    if (!clientContext) return { error: "Not found" }
    if (clientContext.archived) return { error: "Restore this client before adding a project" }

    const workspaceId = clientContext.workspace_id
    if (data.workspace_id && data.workspace_id !== workspaceId) {
      return { error: "Client does not belong to that workspace" }
    }
    if (!data.name?.trim() || data.name.trim().length > 500) {
      return { error: "Project name must be between 1 and 500 characters" }
    }
    if (!["list", "board", "calendar", "timeline"].includes(data.default_view)) {
      return { error: "Invalid default project view" }
    }

    const allowedWorkspace = await canAccessWorkspace(userId, workspaceId, "write")
    if (!allowedWorkspace) return { error: "Not found" }

    const { project, sections } = await prisma.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: buildProjectCreateData({
          name: data.name,
          description: data.description,
          deadline: normalizeDueDate(data.deadline) ?? null,
          defaultView: data.default_view,
          workspaceId,
          clientId: clientContext.id,
          ownerId: userId,
          color: data.color,
        }),
      })

      // Sections organize work inside a project. Task workflow is represented by Task.status.
      await tx.section.create({
        data: { ...DEFAULT_PROJECT_SECTION, project_id: createdProject.id },
      })

      const createdSections = await tx.section.findMany({
        where: { project_id: createdProject.id },
        select: { id: true, name: true, position: true },
        orderBy: { position: "asc" },
      })

      return { project: createdProject, sections: createdSections }
    })

    await logActivity({
      workspaceId,
      actorId: userId,
      entityType: "project",
      entityId: project.id,
      action: "project_created",
      meta: { projectId: project.id, name: project.name, clientId: clientContext.id },
    })

    revalidatePath("/")
    revalidatePath("/home")
    revalidatePath("/clients")
    revalidatePath("/portfolios")
    return { success: true, project: { ...project, sections } }
  } catch (error: unknown) {
    console.error("Failed to create project:", error)
    return { error: getErrorMessage(error) || "Failed to create project" }
  }
}

export async function updateProject(
  projectId: string,
  data: {
    name?: string
    description?: string | null
    deadline?: Date | string | null
    status?: string
    color?: string | null
    default_view?: string
  }
) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const projectContext = await getAccessibleProjectContext(userId, projectId, "edit")
    if (!projectContext) return { error: "Not found" }

    const beforeProject = await getProjectHistorySnapshot(projectId)
    if (!beforeProject) return { error: "Not found" }

    if (data.status !== undefined && !isProjectStatus(data.status)) {
      return { error: "Invalid project status" }
    }
    if (data.default_view !== undefined && !["list", "board", "calendar", "timeline"].includes(data.default_view)) {
      return { error: "Invalid default project view" }
    }
    if (data.color !== undefined && data.color !== null && !/^#[0-9a-f]{6}$/i.test(data.color)) {
      return { error: "Invalid project color" }
    }

    if (data.status === "complete") {
      const [taskCount, incompleteTasks] = await prisma.$transaction([
        prisma.task.count({ where: { project_id: projectId, archived: false } }),
        prisma.task.count({
          where: {
            project_id: projectId,
            archived: false,
            status: { not: "complete" },
          },
        }),
      ])

      if (taskCount === 0 || incompleteTasks > 0) {
        return { error: "Project completes automatically when all tasks are done" }
      }
    }

    const updateData: Prisma.ProjectUpdateInput = {}

    if (data.name !== undefined) {
      if (!data.name.trim()) return { error: "Project name is required" }
      updateData.name = data.name.trim()
    }

    if (data.description !== undefined) {
      updateData.description = data.description?.trim() || ""
    }

    if (data.deadline !== undefined) {
      updateData.deadline = normalizeDueDate(data.deadline)
    }

    if (data.status !== undefined) {
      updateData.status = data.status
    }
    if (data.color !== undefined) {
      updateData.color = data.color
    }
    if (data.default_view !== undefined) {
      updateData.default_view = data.default_view
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: updateData,
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
      },
    })

    const afterProject: ProjectHistorySnapshot = {
      id: updatedProject.id,
      workspace_id: updatedProject.workspace_id,
      client_id: updatedProject.client_id,
      name: updatedProject.name,
      description: updatedProject.description,
      deadline: updatedProject.deadline,
      status: updatedProject.status,
      color: updatedProject.color,
      default_view: updatedProject.default_view,
    }

    const historyEntries = buildProjectUpdateHistoryEntries(beforeProject, afterProject)
    if (historyEntries.length > 0) {
      await logProjectHistoryEntries(updatedProject.workspace_id, userId, updatedProject.id, historyEntries)
    }

    const syncedProject = data.status !== undefined ? await syncProjectCompletionState(updatedProject.id, userId) : null
    const project = syncedProject?.project || updatedProject

    revalidateMany(getTaskRevalidationPaths(project.id, project.client_id))

    return { success: true, project }
  } catch (error: unknown) {
    console.error("Failed to update project:", error)
    return { error: getErrorMessage(error) || "Failed to update project" }
  }
}

export async function deleteProject(projectId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const projectContext = await getAccessibleProjectContext(userId, projectId, "manage")
    if (!projectContext) return { error: "Not found" }

    const project = await prisma.project.findUnique({
      where: { id: projectContext.id },
      select: { id: true, name: true, workspace_id: true, client_id: true },
    })
    if (!project) return { error: "Not found" }

    const deletedTasks = await prisma.$transaction(async (tx) => {
      const taskCount = await tx.task.count({ where: { project_id: project.id } })
      await tx.task.deleteMany({ where: { project_id: project.id } })
      await tx.project.delete({ where: { id: project.id } })
      return taskCount
    })

    await logActivity({
      workspaceId: project.workspace_id,
      actorId: userId,
      entityType: "project",
      entityId: project.id,
      action: "project_deleted",
      meta: {
        source: "manual",
        projectId: project.id,
        projectName: project.name,
        clientId: project.client_id,
        deletedTasks,
      },
    })

    revalidateMany(getClientPageRevalidationPaths())
    revalidatePath("/reporting")
    return { success: true, deletedProjectId: project.id, deletedTasks }
  } catch (error: unknown) {
    console.error("Failed to delete project:", error)
    return { error: getErrorMessage(error) || "Failed to delete project" }
  }
}

export async function addProjectMember(data: {
  projectId: string
  userId: string
  role: "admin" | "user"
}) {
  try {
    const actorId = await getSessionUserId()
    if (!actorId) return { error: "Unauthorized" }
    if (!isManageableProjectRole(data.role)) return { error: "Invalid role" }

    const projectContext = await getAccessibleProjectContext(actorId, data.projectId, "manage")
    if (!projectContext) return { error: "Not found" }

    const [workspaceMemberExists, targetUser, existingMembership] = await Promise.all([
      ensureWorkspaceMember(projectContext.workspace_id, data.userId),
      prisma.user.findUnique({ where: { id: data.userId }, select: { id: true, full_name: true } }),
      prisma.projectMember.findUnique({
        where: {
          project_id_user_id: {
            project_id: projectContext.id,
            user_id: data.userId,
          },
        },
        select: { id: true },
      }),
    ])

    if (!workspaceMemberExists || !targetUser) return { error: "User must belong to the workspace" }
    if (existingMembership) return { error: "User is already part of this project" }

    await prisma.projectMember.create({
      data: {
        project_id: projectContext.id,
        user_id: data.userId,
        role: data.role,
      },
    })

    await logProjectHistoryEntries(projectContext.workspace_id, actorId, projectContext.id, [
      {
        action: "project_member_added",
        meta: {
          source: "manual",
          memberId: data.userId,
          memberName: targetUser.full_name,
          to: data.role,
        },
      },
    ])

    revalidateMany([...getTaskRevalidationPaths(projectContext.id, projectContext.client_id), "/inbox"])
    return { success: true }
  } catch (error: unknown) {
    console.error("Failed to add project member:", error)
    return { error: getErrorMessage(error) || "Failed to add project member" }
  }
}

export async function updateProjectMemberRole(data: {
  projectId: string
  userId: string
  role: "admin" | "user"
}) {
  try {
    const actorId = await getSessionUserId()
    if (!actorId) return { error: "Unauthorized" }
    if (!isManageableProjectRole(data.role)) return { error: "Invalid role" }

    const projectContext = await getAccessibleProjectContext(actorId, data.projectId, "manage")
    if (!projectContext) return { error: "Not found" }
    if (data.userId === projectContext.owner_id) return { error: "Project owner role cannot be changed" }

    const membership = await prisma.projectMember.findUnique({
      where: {
        project_id_user_id: {
          project_id: projectContext.id,
          user_id: data.userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            full_name: true,
          },
        },
      },
    })

    if (!membership) return { error: "Project member not found" }
    if (membership.role === data.role) return { success: true }

    await prisma.projectMember.update({
      where: { id: membership.id },
      data: { role: data.role },
    })

    await logProjectHistoryEntries(projectContext.workspace_id, actorId, projectContext.id, [
      {
        action: "project_member_role_changed",
        meta: {
          source: "manual",
          memberId: membership.user.id,
          memberName: membership.user.full_name,
          from: membership.role,
          to: data.role,
        },
      },
    ])

    revalidateMany([...getTaskRevalidationPaths(projectContext.id, projectContext.client_id), "/inbox"])
    return { success: true }
  } catch (error: unknown) {
    console.error("Failed to update project member role:", error)
    return { error: getErrorMessage(error) || "Failed to update project member role" }
  }
}

export async function removeProjectMember(data: { projectId: string; userId: string }) {
  try {
    const actorId = await getSessionUserId()
    if (!actorId) return { error: "Unauthorized" }

    const projectContext = await getAccessibleProjectContext(actorId, data.projectId, "manage")
    if (!projectContext) return { error: "Not found" }
    if (data.userId === projectContext.owner_id) return { error: "Project owner cannot be removed" }

    const membership = await prisma.projectMember.findUnique({
      where: {
        project_id_user_id: {
          project_id: projectContext.id,
          user_id: data.userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            full_name: true,
          },
        },
      },
    })

    if (!membership) return { error: "Project member not found" }

    await prisma.projectMember.delete({ where: { id: membership.id } })

    await logProjectHistoryEntries(projectContext.workspace_id, actorId, projectContext.id, [
      {
        action: "project_member_removed",
        meta: {
          source: "manual",
          memberId: membership.user.id,
          memberName: membership.user.full_name,
          from: membership.role,
        },
      },
    ])

    revalidateMany([...getTaskRevalidationPaths(projectContext.id, projectContext.client_id), "/inbox"])
    return { success: true }
  } catch (error: unknown) {
    console.error("Failed to remove project member:", error)
    return { error: getErrorMessage(error) || "Failed to remove project member" }
  }
}

export async function convertDirectTaskToProject(
  taskId: string,
  options?: {
    projectName?: string
    default_view?: string
    color?: string
  }
) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const taskContext = await getAccessibleTaskContext(userId, taskId, "edit")
    if (!taskContext) return { error: "Not found" }
    if (taskContext.project_id) return { error: "Task already belongs to a project" }
    if (!taskContext.client_id) return { error: "Only direct client tasks can be converted" }

    const [clientContext, beforeSnapshot, taskRecord] = await Promise.all([
      getAccessibleClientContext(userId, taskContext.client_id, "write"),
      getTaskHistorySnapshot(taskId),
      prisma.task.findUnique({
        where: { id: taskId },
        include: taskInclude,
      }),
    ])

    if (!clientContext || !beforeSnapshot || !taskRecord) return { error: "Not found" }

    const projectName = options?.projectName?.trim() || taskRecord.title.trim() || "Converted Project"
    const defaultView = options?.default_view || "list"
    const projectColor = options?.color || taskRecord.client?.color || "#6366f1"
    if (!["list", "board", "calendar", "timeline"].includes(defaultView)) {
      return { error: "Invalid default project view" }
    }

    const { project, generalSection, updatedTask, sections } = await prisma.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          workspace_id: taskRecord.workspace_id,
          client_id: clientContext.id,
          name: projectName,
          description: "",
          status: "incomplete",
          color: projectColor,
          icon: "project",
          owner_id: userId,
          privacy: "workspace_visible",
          default_view: defaultView,
          members: {
            create: {
              user_id: userId,
              role: "owner",
            },
          },
        },
      })

      const createdGeneralSection = await tx.section.create({
        data: {
          name: "General",
          position: 1000,
          project_id: createdProject.id,
        },
      })

      const createdSections = await tx.section.findMany({
        where: { project_id: createdProject.id },
        select: { id: true, name: true, position: true },
        orderBy: { position: "asc" },
      })

      const nextTask = await tx.task.update({
        where: { id: taskId },
        data: {
          project_id: createdProject.id,
          client_id: clientContext.id,
          section_id: createdGeneralSection.id,
          position: 1000,
        },
        include: taskInclude,
      })

      await tx.task.updateMany({
        where: { parent_task_id: taskId },
        data: {
          project_id: createdProject.id,
          client_id: clientContext.id,
          section_id: createdGeneralSection.id,
        },
      })

      return {
        project: createdProject,
        generalSection: createdGeneralSection,
        updatedTask: nextTask,
        sections: createdSections,
      }
    })

    await logActivity({
      workspaceId: taskRecord.workspace_id,
      actorId: userId,
      entityType: "project",
      entityId: project.id,
      action: "project_created",
      meta: { projectId: project.id, name: project.name, clientId: clientContext.id, sourceTaskId: taskId },
    })

    await logProjectHistoryEntries(taskRecord.workspace_id, userId, project.id, [
      {
        action: "project_task_added",
        meta: { source: "manual", taskId, title: updatedTask.title },
      },
    ])

    const syncedProject = await syncProjectCompletionState(project.id, userId)

    await logTaskHistoryEntries(taskRecord.workspace_id, userId, taskId, [
      {
        action: "task_project_changed",
        meta: {
          source: "manual",
          from: beforeSnapshot.project?.name || null,
          to: project.name,
        },
      },
      {
        action: "task_section_changed",
        meta: {
          source: "manual",
          from: beforeSnapshot.section?.name || null,
          to: generalSection.name,
        },
      },
      {
        action: "task_converted_to_project",
        meta: {
          source: "manual",
          projectId: project.id,
          projectName: project.name,
          title: project.name,
        },
      },
    ])

    revalidateMany([
      ...getTaskRevalidationPaths(null, taskContext.client_id),
      ...getTaskRevalidationPaths(project.id, clientContext.id),
    ])

    return { success: true, project: { ...(syncedProject?.project || project), sections }, task: updatedTask }
  } catch (error: unknown) {
    console.error("Failed to convert direct task to project:", error)
    return { error: getErrorMessage(error) || "Failed to convert task to project" }
  }
}

export async function createSection(data: { name: string; project_id?: string; user_id?: string; position?: number }) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    if (data.user_id && data.user_id !== userId) return { error: "Not found" }

    const projectContext = data.project_id
      ? await getAccessibleProjectContext(userId, data.project_id, "edit")
      : null

    if (data.project_id && !projectContext) return { error: "Not found" }

    const section = await prisma.section.create({
      data: {
        name: data.name,
        position: data.position || 0,
        ...(projectContext ? { project_id: projectContext.id } : { user_id: userId }),
      },
    })

    if (projectContext) {
      await logActivity({
        workspaceId: projectContext.workspace_id,
        actorId: userId,
        entityType: "project",
        entityId: projectContext.id,
        action: "section_created",
        meta: { projectId: projectContext.id, sectionId: section.id, sectionName: section.name },
      })
      revalidateMany(getTaskRevalidationPaths(projectContext.id))
    } else {
      revalidatePath("/my-tasks")
    }

    return { success: true, section }
  } catch (error: unknown) {
    return { error: getErrorMessage(error) }
  }
}

export async function deleteSection(sectionId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const sectionContext = await getAccessibleSectionContext(userId, sectionId, "edit")
    if (!sectionContext) return { error: "Not found" }

    let replacementSectionId: string | null = null
    if (sectionContext.project_id) {
      const replacementSection = await prisma.section.findFirst({
        where: {
          project_id: sectionContext.project_id,
          id: { not: sectionId },
        },
        orderBy: { position: "asc" },
        select: { id: true },
      })

      replacementSectionId = replacementSection?.id || null
    }

    await prisma.task.updateMany({
      where: { section_id: sectionId },
      data: { section_id: replacementSectionId },
    })

    const deletedSection = await prisma.section.delete({ where: { id: sectionId } })

    if (sectionContext.project) {
      await logActivity({
        workspaceId: sectionContext.project.workspace_id,
        actorId: userId,
        entityType: "project",
        entityId: sectionContext.project.id,
        action: "section_deleted",
        meta: { projectId: sectionContext.project.id, sectionId },
      })

      revalidateMany(getTaskRevalidationPaths(sectionContext.project.id))
    } else {
      revalidatePath("/my-tasks")
    }

    return { success: true, section: deletedSection }
  } catch (error: unknown) {
    return { error: getErrorMessage(error) }
  }
}

export async function updateTask(
  taskId: string,
  input: unknown
) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const parsedInput = parseTaskUpdateInput(input)
    if (!parsedInput.success) return { error: parsedInput.error }
    const data = parsedInput.data

    const taskContext = await getAccessibleTaskContext(userId, taskId, "edit")
    if (!taskContext) return { error: "Not found" }
    const beforeSnapshot = await getTaskHistorySnapshot(taskId)
    if (!beforeSnapshot) return { error: "Not found" }
    const qualityWorkflow = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        quality_required: true,
        quality_policy_override: true,
        quality_state: true,
        reviewer_id: true,
        assignee_id: true,
        first_submitted_at: true,
        status: true,
        project: { select: { quality_policy: true } },
      },
    })
    if (!qualityWorkflow) return { error: "Not found" }

    const effectiveQualityRequired = qualityWorkflow.quality_required
      || qualityWorkflow.quality_policy_override === "required"
      || (!qualityWorkflow.quality_policy_override && qualityWorkflow.project?.quality_policy === "required")
      || qualityWorkflow.quality_state !== "not_required"

    if (data.status !== undefined && data.status !== qualityWorkflow.status) {
      const transitionError = validateManualTaskTransition({
        from: qualityWorkflow.status,
        to: data.status,
        qualityRequired: effectiveQualityRequired,
        qualityState: qualityWorkflow.quality_state,
      })
      if (transitionError) return { error: transitionError }
    }

    if (data.assignee_id && data.assignee_id === qualityWorkflow.reviewer_id) {
      return { error: "The assignee and quality reviewer must be different people" }
    }

    if (data.assignee_id !== undefined && qualityWorkflow.first_submitted_at && data.assignee_id !== qualityWorkflow.assignee_id) {
      return { error: "The assignee is locked after the first quality submission to preserve KPI ownership" }
    }

    const nextProjectContext =
      data.project_id === undefined
        ? taskContext.project_id
          ? await getAccessibleProjectContext(userId, taskContext.project_id, "edit")
          : null
        : data.project_id === null
          ? null
          : await getAccessibleProjectContext(userId, data.project_id, "edit")

    if (data.project_id && !nextProjectContext) return { error: "Not found" }

    const requestedClientId = data.client_id !== undefined
      ? data.client_id
      : data.project_id !== undefined
        ? nextProjectContext?.client_id || null
        : taskContext.client_id

    const nextClientContext =
      requestedClientId === null
          ? null
          : await getAccessibleClientContext(userId, requestedClientId, "write")

    if (requestedClientId && !nextClientContext) return { error: "Not found" }

    const nextSectionContext = data.section_id
      ? await getAccessibleSectionContext(userId, data.section_id, "edit")
      : null

    if (data.section_id && !nextSectionContext) return { error: "Not found" }

    if (nextProjectContext && nextClientContext && nextProjectContext.client_id !== nextClientContext.id) {
      return { error: "Project does not belong to that client" }
    }
    if (nextSectionContext?.project && nextClientContext && nextSectionContext.project.client_id !== nextClientContext.id) {
      return { error: "Section's project does not belong to that client" }
    }

    const resolvedProjectId = nextProjectContext?.id || nextSectionContext?.project_id || null
    const resolvedClientId = nextProjectContext
      ? nextProjectContext.client_id
      : nextSectionContext?.project
        ? nextSectionContext.project.client_id
        : nextClientContext?.id || null

    if (nextSectionContext?.user_id && (resolvedProjectId || resolvedClientId)) {
      return { error: "Client and project tasks cannot use personal sections" }
    }

    if (resolvedProjectId && nextSectionContext?.project_id && nextSectionContext.project_id !== resolvedProjectId) {
      return { error: "Section does not belong to that project" }
    }

    if (!resolvedProjectId && resolvedClientId && nextSectionContext) {
      return { error: "Direct client tasks cannot use sections" }
    }

    const resolvedWorkspaceId = nextProjectContext?.workspace_id || nextSectionContext?.project?.workspace_id || nextClientContext?.workspace_id || taskContext.workspace_id

    if (resolvedWorkspaceId !== taskContext.workspace_id) {
      return { error: "Tasks cannot be moved between workspaces" }
    }

    if (data.assignee_id !== undefined && data.assignee_id !== null) {
      const assigneeAllowed = await ensureWorkspaceMember(resolvedWorkspaceId, data.assignee_id)
      if (!assigneeAllowed) return { error: "Not found" }
    }

    const movedProjectQualityPolicy = data.project_id !== undefined && resolvedProjectId
      ? await prisma.project.findUnique({ where: { id: resolvedProjectId }, select: { quality_policy: true } })
      : null

    const updateData: Prisma.TaskUncheckedUpdateInput = {}

    if (data.title !== undefined) updateData.title = data.title
    if (data.description_rich_text !== undefined) updateData.description_rich_text = data.description_rich_text
    if (data.status !== undefined) updateData.status = data.status
    if (data.priority !== undefined) updateData.priority = data.priority
    if (data.assignee_id !== undefined) updateData.assignee_id = data.assignee_id

    if (data.project_id !== undefined && !taskContext.parent_task_id && !qualityWorkflow.first_submitted_at) {
      updateData.quality_required = movedProjectQualityPolicy?.quality_policy === "required"
      updateData.quality_state = movedProjectQualityPolicy?.quality_policy === "required" ? "ready" : "not_required"
    }

    if (data.due_date !== undefined) {
      updateData.due_date = normalizeDueDate(data.due_date)
    }

    if (data.project_id !== undefined || nextSectionContext) {
      updateData.project_id = resolvedProjectId
    }

    if (data.client_id !== undefined || data.project_id !== undefined || nextSectionContext || resolvedClientId !== taskContext.client_id) {
      updateData.client_id = resolvedClientId
    }

    if (data.section_id === null) {
      updateData.section_id = null
    } else if (nextSectionContext) {
      updateData.section_id = nextSectionContext.id
    }

    if (!resolvedProjectId && !resolvedClientId && data.section_id === undefined && (data.project_id !== undefined || data.client_id !== undefined)) {
      let recentSection = await prisma.section.findFirst({
        where: { user_id: userId, name: "Recently assigned" },
        select: { id: true }
      })
      if (!recentSection) {
        recentSection = await prisma.section.create({
          data: { name: "Recently assigned", user_id: userId, position: 0 },
          select: { id: true }
        })
      }
      updateData.section_id = recentSection.id
    }

    if (resolvedProjectId && data.section_id === undefined) {
      const currentSectionBelongsToProject = taskContext.section?.project_id === resolvedProjectId
      if (!currentSectionBelongsToProject) {
        const firstSection = await prisma.section.findFirst({
          where: { project_id: resolvedProjectId },
          orderBy: { position: "asc" },
        })

        updateData.section_id = firstSection?.id || null
      }
    }

    if (!resolvedProjectId && resolvedClientId && data.section_id === undefined) {
      updateData.section_id = null
    }

    if (data.status === "complete") {
      updateData.completed_at = new Date()
    }

    if (data.status && data.status !== "complete") {
      updateData.completed_at = null
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: taskInclude,
    })

    const afterSnapshot: TaskHistorySnapshot = {
      title: task.title,
      description_rich_text: task.description_rich_text,
      status: task.status,
      priority: task.priority,
      start_date: task.start_date,
      due_date: task.due_date,
      assignee: task.assignee ? { id: task.assignee.id, full_name: task.assignee.full_name } : null,
      project: task.project ? { id: task.project.id, name: task.project.name } : null,
      client: task.client ? { id: task.client.id, name: task.client.name } : null,
      section: task.section ? { id: task.section.id, name: task.section.name } : null,
    }

    const historyEntries = buildTaskUpdateHistoryEntries(beforeSnapshot, afterSnapshot)
    if (historyEntries.length > 0) {
      await logTaskHistoryEntries(task.workspace_id, userId, task.id, historyEntries)
    }

    if (taskContext.project_id && taskContext.project_id !== task.project_id) {
      await logProjectHistoryEntries(task.workspace_id, userId, taskContext.project_id, [
        {
          action: "project_task_removed",
          meta: { source: "manual", taskId: task.id, title: task.title },
        },
      ])
    }

    if (task.project_id && task.project_id !== taskContext.project_id) {
      await logProjectHistoryEntries(task.workspace_id, userId, task.project_id, [
        {
          action: "project_task_added",
          meta: { source: "manual", taskId: task.id, title: task.title },
        },
      ])
    }

    const syncTargets = [...new Set([taskContext.project_id, task.project_id].filter(Boolean))] as string[]
    for (const projectId of syncTargets) {
      await syncProjectCompletionState(projectId, userId)
    }

    revalidateMany([
      ...getTaskRevalidationPaths(taskContext.project_id, taskContext.client_id),
      ...getTaskRevalidationPaths(task.project_id, task.client_id),
    ])

    return { success: true, task }
  } catch (error: unknown) {
    return { error: getErrorMessage(error) }
  }
}

export async function createSubtask(parentTaskId: string, title: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const parentTask = await getAccessibleTaskContext(userId, parentTaskId, "edit")
    if (!parentTask) return { error: "Not found" }

    const siblings = await prisma.task.count({ where: { parent_task_id: parentTaskId } })

    const subtask = await prisma.task.create({
      data: {
        workspace_id: parentTask.workspace_id,
        project_id: parentTask.project_id,
        client_id: parentTask.client_id,
        section_id: parentTask.section_id,
        parent_task_id: parentTaskId,
        title,
        status: "incomplete",
        creator_id: userId,
        assignee_id: parentTask.assignee_id,
        position: (siblings + 1) * 1000,
      },
      include: taskInclude,
    })

    await logTaskHistoryEntries(parentTask.workspace_id, userId, parentTaskId, [
      {
        action: "subtask_created",
        meta: { source: "manual", taskId: parentTaskId, subtaskId: subtask.id, title: subtask.title },
      },
    ])

    if (subtask.project_id) {
      await logProjectHistoryEntries(subtask.workspace_id, userId, subtask.project_id, [
        {
          action: "project_task_added",
          meta: { source: "manual", taskId: subtask.id, title: subtask.title },
        },
      ])
      await syncProjectCompletionState(subtask.project_id, userId)
    }

    revalidateMany(getTaskRevalidationPaths(parentTask.project_id, parentTask.client_id))
    return { success: true, subtask }
  } catch (error) {
    return { error: getErrorMessage(error) }
  }
}

export async function toggleSubtaskStatus(taskId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const subtask = await getAccessibleTaskContext(userId, taskId, "edit")
    if (!subtask) return { error: "Not found" }
    if (!subtask.parent_task_id) return { error: "Not found" }

    const current = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } })
    if (!current) return { error: "Not found" }

    const status = current.status === "complete" ? "incomplete" : "complete"

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        completed_at: status === "complete" ? new Date() : null,
      },
      include: taskInclude,
    })

    await logTaskHistoryEntries(updated.workspace_id, userId, updated.parent_task_id || updated.id, [
      {
        action: status === "complete" ? "subtask_completed" : "subtask_reopened",
        meta: { source: "manual", taskId: updated.parent_task_id || updated.id, subtaskId: updated.id },
      },
    ])

    if (updated.project_id) {
      await syncProjectCompletionState(updated.project_id, userId)
    }

    revalidateMany(getTaskRevalidationPaths(updated.project_id, updated.client_id))
    return { success: true, subtask: updated }
  } catch (error) {
    return { error: getErrorMessage(error) }
  }
}

export async function deleteSubtask(taskId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const subtask = await getAccessibleTaskContext(userId, taskId, "edit")
    if (!subtask) return { error: "Not found" }
    if (!subtask.parent_task_id) return { error: "Not found" }

    const deleted = await prisma.task.delete({ where: { id: taskId } })

    await logTaskHistoryEntries(deleted.workspace_id, userId, deleted.parent_task_id || deleted.id, [
      {
        action: "subtask_deleted",
        meta: { source: "manual", taskId: deleted.parent_task_id || deleted.id, subtaskId: deleted.id, title: deleted.title },
      },
    ])

    if (deleted.project_id) {
      await logProjectHistoryEntries(deleted.workspace_id, userId, deleted.project_id, [
        {
          action: "project_task_removed",
          meta: { source: "manual", taskId: deleted.id, title: deleted.title },
        },
      ])
      await syncProjectCompletionState(deleted.project_id, userId)
    }

    revalidateMany(getTaskRevalidationPaths(deleted.project_id, deleted.client_id))
    return { success: true, taskId: deleted.id }
  } catch (error) {
    return { error: getErrorMessage(error) }
  }
}

export async function addTaskAttachment(taskId: string, data: { file_name: string; file_url: string }) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const taskContext = await getAccessibleTaskContext(userId, taskId, "edit")
    if (!taskContext) return { error: "Not found" }

    const attachment = await prisma.attachment.create({
      data: {
        task_id: taskId,
        uploaded_by: userId,
        file_name: data.file_name,
        file_url: data.file_url,
        mime_type: "link",
        file_size: 0,
      },
    })

    await logTaskHistoryEntries(taskContext.workspace_id, userId, taskId, [
      {
        action: "attachment_added",
        meta: { source: "manual", taskId, attachmentId: attachment.id, title: attachment.file_name, to: attachment.file_name },
      },
    ])

    const task = await prisma.task.findUnique({ where: { id: taskId }, include: taskInclude })
    if (!task) return { error: "Not found" }

    revalidateMany(getTaskRevalidationPaths(task.project_id, task.client_id))
    return { success: true, task }
  } catch (error) {
    return { error: getErrorMessage(error) }
  }
}

export async function deleteTaskAttachment(attachmentId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, task_id: true, file_name: true },
    })

    if (!attachment) return { error: "Not found" }

    const taskContext = await getAccessibleTaskContext(userId, attachment.task_id, "edit")
    if (!taskContext) return { error: "Not found" }

    await prisma.attachment.delete({ where: { id: attachmentId } })

    await logTaskHistoryEntries(taskContext.workspace_id, userId, attachment.task_id, [
      {
        action: "attachment_removed",
        meta: { source: "manual", taskId: attachment.task_id, attachmentId, from: attachment.file_name, title: attachment.file_name },
      },
    ])

    const task = await prisma.task.findUnique({ where: { id: attachment.task_id }, include: taskInclude })
    if (!task) return { error: "Not found" }

    revalidateMany(getTaskRevalidationPaths(task.project_id, task.client_id))
    return { success: true, task }
  } catch (error) {
    return { error: getErrorMessage(error) }
  }
}

export async function getTaskActivity(taskId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return []

    const taskContext = await getAccessibleTaskContext(userId, taskId, "view")
    if (!taskContext) return []

    return prisma.activityLog.findMany({
      where: {
        workspace_id: taskContext.workspace_id,
        entity_type: "task",
        entity_id: taskId,
      },
      include: { actor: { select: USER_PUBLIC_SELECT } },
      orderBy: { created_at: "desc" },
      take: 25,
    })
  } catch (error) {
    console.error("Failed to get task activity:", error)
    return []
  }
}

export async function getProjectActivity(projectId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return []

    const projectContext = await getAccessibleProjectContext(userId, projectId, "view")
    if (!projectContext) return []

    return prisma.activityLog.findMany({
      where: {
        workspace_id: projectContext.workspace_id,
        entity_type: "project",
        entity_id: projectId,
      },
      include: { actor: { select: USER_PUBLIC_SELECT } },
      orderBy: { created_at: "desc" },
      take: 30,
    })
  } catch (error) {
    console.error("Failed to get project activity:", error)
    return []
  }
}

export async function getProjectMemberManagement(projectId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { canManage: false, members: [], workspaceMembers: [] }

    const [projectContext, canManageProject, project] = await Promise.all([
      getAccessibleProjectContext(userId, projectId, "view"),
      getAccessibleProjectContext(userId, projectId, "manage"),
      prisma.project.findFirst({
        where: {
          id: projectId,
          ...projectAccessWhere(userId, "view"),
        },
        select: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  full_name: true,
                  email: true,
                  avatar_url: true,
                },
              },
            },
          },
        },
      }),
    ])

    if (!projectContext || !project) {
      return { canManage: false, members: [], workspaceMembers: [] }
    }

    const workspaceMembers = canManageProject
      ? await prisma.workspaceMember.findMany({
          where: { workspace_id: projectContext.workspace_id, role: { not: "guest" } },
          select: {
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
      : []

    return {
      canManage: Boolean(canManageProject),
      members: [...project.members].sort((left, right) => {
        const priority = { owner: 0, admin: 1, editor: 2, commenter: 3, viewer: 4 } as Record<string, number>
        const leftRank = priority[left.role] ?? 99
        const rightRank = priority[right.role] ?? 99

        if (leftRank !== rightRank) return leftRank - rightRank
        return left.user.full_name.localeCompare(right.user.full_name)
      }),
      workspaceMembers: workspaceMembers.map((membership) => membership.user),
    }
  } catch (error) {
    console.error("Failed to get project member management data:", error)
    return { canManage: false, members: [], workspaceMembers: [] }
  }
}

export async function getUserProjects() {
  try {
    const userId = await getSessionUserId()
    if (!userId) return []
    const activeWorkspace = await getActiveWorkspaceForUser(userId)
    if (!activeWorkspace) return []

    return prisma.project.findMany({
      where: {
        workspace_id: activeWorkspace.id,
        archived: false,
        AND: [
          projectAccessWhere(userId, "view"),
          {
            OR: [
              { client_id: null },
              { client: { archived: false } },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        color: true,
        client_id: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { updated_at: "desc" },
    })
  } catch (error) {
    console.error("Failed to get projects:", error)
    return []
  }
}

export async function getUserClients() {
  try {
    const userId = await getSessionUserId()
    if (!userId) return []
    const activeWorkspace = await getActiveWorkspaceForUser(userId)
    if (!activeWorkspace) return []

    return prisma.client.findMany({
      where: {
        workspace_id: activeWorkspace.id,
        archived: false,
        workspace: workspaceAccessWhere(userId, "view"),
      },
      select: {
        id: true,
        name: true,
        color: true,
        email: true,
      },
      orderBy: [{ updated_at: "desc" }, { name: "asc" }],
    })
  } catch (error) {
    console.error("Failed to get clients:", error)
    return []
  }
}

export async function getAssignableUsers(taskId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return []

    const taskContext = await getAccessibleTaskContext(userId, taskId, "view")
    if (!taskContext) return []

    const members = await prisma.workspaceMember.findMany({
      where: {
        workspace_id: taskContext.workspace_id,
        role: { not: "guest" },
      },
      select: {
        user: {
          select: {
            id: true,
            full_name: true,
            email: true,
            avatar_url: true,
          },
        },
      },
    })

    return members.map((member) => member.user).sort((a, b) => a.full_name.localeCompare(b.full_name))
  } catch (error) {
    console.error("Failed to get assignable users:", error)
    return []
  }
}

export async function searchWorkspace(query: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { projects: [], tasks: [] }

    const term = query.trim()
    if (!term) return { projects: [], tasks: [] }

    const activeWorkspace = await getActiveWorkspaceForUser(userId)
    if (!activeWorkspace) return { projects: [], tasks: [] }

    const [projects, tasks] = await Promise.all([
      prisma.project.findMany({
        where: {
          AND: [
            projectAccessWhere(userId, "view"),
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
        select: { id: true, name: true, color: true, default_view: true },
        take: 8,
        orderBy: { updated_at: "desc" },
      }),
      prisma.task.findMany({
        where: {
          workspace_id: activeWorkspace.id,
          archived: false,
          title: { contains: term },
          OR: [
            { project: { ...projectAccessWhere(userId, "view") } },
            {
              project_id: null,
              client: {
                workspace: workspaceAccessWhere(userId, "view"),
              },
            },
            { project_id: null, client_id: null, assignee_id: userId },
            { project_id: null, client_id: null, creator_id: userId },
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
  } catch (error) {
    console.error("Failed to search workspace:", error)
    return { projects: [], tasks: [] }
  }
}

export async function getAccessibleWorkspaceSummary() {
  const userId = await getSessionUserId()
  if (!userId) return []

  return prisma.workspace.findMany({
    where: workspaceAccessWhere(userId, "view"),
    select: {
      id: true,
      name: true,
      slug: true,
    },
    orderBy: { created_at: "asc" },
  })
}

export async function getWorkspaceMembers() {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { success: false as const, users: [] }

    const workspace = await getActiveWorkspaceForUser(userId)
    if (!workspace) return { success: false as const, users: [] }

    const members = await prisma.workspaceMember.findMany({
      where: {
        workspace_id: workspace.id,
        role: { not: "guest" },
      },
      select: {
        user: {
          select: {
            id: true,
            full_name: true,
            email: true,
            avatar_url: true,
          },
        },
      },
    })

    return {
      success: true as const,
      users: members.map((m) => m.user).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    }
  } catch {
    return { success: false as const, users: [] }
  }
}
