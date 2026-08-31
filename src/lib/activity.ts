import { format } from "date-fns"
import { prisma } from "@/lib/prisma"

interface ActivityInput {
  workspaceId: string
  actorId?: string | null
  entityType: string
  entityId: string
  action: string
  meta?: Record<string, unknown>
}

function formatNotificationValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "empty"
  if (typeof value !== "string") return String(value)

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime()) && value.includes("T")) {
    return format(parsed, "MMM d, yyyy")
  }

  return value.replace(/_/g, " ")
}

function buildProjectActivityBody({
  actorName,
  action,
  meta,
  taskTitle,
}: {
  actorName: string
  action: string
  meta?: Record<string, unknown>
  taskTitle?: string | null
}) {
  const titleFromMeta = typeof meta?.title === "string" ? meta.title : null
  const toValue = formatNotificationValue(meta?.to)
  const fromValue = formatNotificationValue(meta?.from)
  const label = titleFromMeta || taskTitle || "the project"

  switch (action) {
    case "project_created":
      return `${actorName} created the project.`
    case "project_name_changed":
      return `${actorName} renamed the project from ${fromValue} to ${toValue}.`
    case "project_description_changed":
      return `${actorName} updated the project description.`
    case "project_deadline_changed":
      return `${actorName} updated the project deadline to ${toValue}.`
    case "project_status_changed":
      return `${actorName} changed the project status to ${toValue}.`
    case "project_quality_policy_changed":
      return `${actorName} updated the project quality policy.`
    case "project_task_added":
      return `${actorName} added ${label} to the project.`
    case "project_task_removed":
      return `${actorName} removed ${label} from the project.`
    case "project_member_added":
      return `${actorName} added ${typeof meta?.memberName === "string" ? meta.memberName : "a member"} as ${toValue}.`
    case "project_member_role_changed":
      return `${actorName} changed ${typeof meta?.memberName === "string" ? meta.memberName : "a member"} from ${fromValue} to ${toValue}.`
    case "project_member_removed":
      return `${actorName} removed ${typeof meta?.memberName === "string" ? meta.memberName : "a member"} from the project.`
    case "section_created":
      return `${actorName} created section ${typeof meta?.sectionName === "string" ? meta.sectionName : ""}.`.trim()
    case "section_deleted":
      return `${actorName} deleted a section.`
    case "task_created":
      return `${actorName} created task ${label}.`
    case "task_title_changed":
      return `${actorName} renamed ${label}.`
    case "task_description_changed":
      return `${actorName} updated the description for ${label}.`
    case "task_status_changed":
      return `${actorName} changed ${label} to ${toValue}.`
    case "task_completed":
      return `${actorName} marked ${label} complete.`
    case "task_reopened":
      return `${actorName} reopened ${label}.`
    case "task_priority_changed":
      return `${actorName} changed the priority for ${label} to ${toValue}.`
    case "task_due_date_changed":
      return `${actorName} changed the due date for ${label} to ${toValue}.`
    case "task_start_date_changed":
      return `${actorName} changed the start date for ${label} to ${toValue}.`
    case "task_assignee_changed":
      return `${actorName} changed the assignee for ${label} to ${toValue}.`
    case "task_project_changed":
      return `${actorName} moved ${label} from ${fromValue} to ${toValue}.`
    case "task_section_changed":
      return `${actorName} moved ${label} to ${toValue}.`
    case "task_moved":
      return `${actorName} moved ${label} between sections.`
    case "comment_added":
    case "task_comment_added":
      return `${actorName} commented on ${label}.`
    case "attachment_added":
      return `${actorName} added attachment ${label}.`
    case "attachment_removed":
      return `${actorName} removed attachment ${label}.`
    case "subtask_created":
      return `${actorName} created subtask ${label}.`
    case "subtask_completed":
      return `${actorName} completed a subtask in ${taskTitle || "the task"}.`
    case "subtask_reopened":
      return `${actorName} reopened a subtask in ${taskTitle || "the task"}.`
    case "subtask_deleted":
      return `${actorName} deleted subtask ${label}.`
    default:
      return `${actorName} ${action.replace(/_/g, " ")}.`
  }
}

async function notifyProjectManagers({
  actorId,
  entityType,
  entityId,
  action,
  meta,
}: Pick<ActivityInput, "actorId" | "entityType" | "entityId" | "action" | "meta">) {
  if (entityType !== "project" && entityType !== "task") return

  // These are already represented by task-level events and otherwise spam owners/admins twice.
  if (action === "project_task_added" || action === "project_task_removed") return
  if (action.startsWith("quality_")) return

  const actor = actorId
    ? await prisma.user.findUnique({ where: { id: actorId }, select: { full_name: true } })
    : null

  const actorName = actor?.full_name || "Someone"

  let project:
    | {
        id: string
        name: string
        members: Array<{ user_id: string }>
      }
    | null = null
  let taskId: string | null = null
  let taskTitle: string | null = null

  if (entityType === "task") {
    const task = await prisma.task.findUnique({
      where: { id: entityId },
      select: {
        id: true,
        title: true,
        project: {
          select: {
            id: true,
            name: true,
            members: {
              where: { role: "admin" },
              select: { user_id: true },
            },
          },
        },
      },
    })

    if (!task?.project) return

    taskId = task.id
    taskTitle = task.title
    project = task.project
  } else {
    const metaTaskId = typeof meta?.taskId === "string" ? meta.taskId : null

    if (metaTaskId) {
      const task = await prisma.task.findUnique({
        where: { id: metaTaskId },
        select: {
          id: true,
          title: true,
          project: {
            select: {
              id: true,
              name: true,
              members: {
                where: { role: "admin" },
                select: { user_id: true },
              },
            },
          },
        },
      })

      if (task?.project) {
        taskId = task.id
        taskTitle = task.title
        project = task.project
      }
    }

    if (!project) {
      project = await prisma.project.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          name: true,
          members: {
            where: { role: "admin" },
            select: { user_id: true },
          },
        },
      })
    }

    if (!project) return
  }

  const recipients = [...new Set(project.members.map((member) => member.user_id))].filter(
    (userId) => userId && userId !== actorId
  )

  if (recipients.length === 0) return

  const relatedEntityType = taskId ? "task" : "project"
  const relatedEntityId = taskId || project.id
  const body = buildProjectActivityBody({ actorName, action, meta, taskTitle })

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      user_id: userId,
      type: "project_activity",
      title: project.name,
      body,
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
    })),
  })
}

export async function logActivity({
  workspaceId,
  actorId,
  entityType,
  entityId,
  action,
  meta,
}: ActivityInput) {
  await prisma.activityLog.create({
    data: {
      workspace_id: workspaceId,
      actor_id: actorId || null,
      entity_type: entityType,
      entity_id: entityId,
      action,
      meta_json: meta ? JSON.stringify(meta) : null,
    },
  })

  try {
    await notifyProjectManagers({ actorId, entityType, entityId, action, meta })
  } catch (error) {
    console.error("Failed to create project notifications:", error)
  }
}

export function parseActivityMeta<T extends Record<string, unknown>>(metaJson: string | null | undefined) {
  if (!metaJson) return null

  try {
    return JSON.parse(metaJson) as T
  } catch {
    return null
  }
}
