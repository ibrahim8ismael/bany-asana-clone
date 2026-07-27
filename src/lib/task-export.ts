import { stringifyCsv } from "@/lib/csv"

const TASK_EXPORT_HEADERS = [
  "title",
  "description",
  "status",
  "priority",
  "assignee_name",
  "assignee_email",
  "project_name",
  "section_name",
  "start_date",
  "due_date",
  "completed_at",
  "created_at",
  "updated_at",
  "task_type",
  "archived",
  "parent_task_title",
  "parent_task_id",
  "tags",
] as const

interface ExportableTask {
  title: string
  description_rich_text: string | null
  status: string
  priority: string | null
  start_date: Date | null
  due_date: Date | null
  completed_at: Date | null
  created_at: Date
  updated_at: Date
  task_type: string
  archived: boolean
  assignee: {
    full_name: string
    email: string
  } | null
  project: {
    name: string
  } | null
  section: {
    name: string
  } | null
  parent_task: {
    id: string
    title: string
  } | null
  tags: Array<{
    tag: {
      name: string
    }
  }>
}

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : ""
}

export function tasksToCsv(tasks: ExportableTask[]) {
  const rows = tasks.map((task) => ({
    title: task.title,
    description: task.description_rich_text || "",
    status: task.status,
    priority: task.priority || "",
    assignee_name: task.assignee?.full_name || "",
    assignee_email: task.assignee?.email || "",
    project_name: task.project?.name || "",
    section_name: task.section?.name || "",
    start_date: toIsoString(task.start_date),
    due_date: toIsoString(task.due_date),
    completed_at: toIsoString(task.completed_at),
    created_at: toIsoString(task.created_at),
    updated_at: toIsoString(task.updated_at),
    task_type: task.task_type,
    archived: task.archived,
    parent_task_title: task.parent_task?.title || "",
    parent_task_id: task.parent_task?.id || "",
    tags: task.tags.map(({ tag }) => tag.name).join("; "),
  }))

  return `\uFEFF${stringifyCsv([...TASK_EXPORT_HEADERS], rows)}`
}

export function toCsvFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tasks"
}
