const TASK_STATUSES = new Set(["incomplete", "in_progress", "complete"])
const TASK_PRIORITIES = new Set(["high", "medium", "low"])
const TASK_UPDATE_KEYS = new Set([
  "title",
  "description_rich_text",
  "status",
  "priority",
  "due_date",
  "assignee_id",
  "project_id",
  "client_id",
  "section_id",
])

export type TaskUpdateInput = {
  title?: string
  description_rich_text?: string | null
  status?: "incomplete" | "in_progress" | "complete"
  priority?: "high" | "medium" | "low" | null
  due_date?: Date | string | null
  assignee_id?: string | null
  project_id?: string | null
  client_id?: string | null
  section_id?: string | null
}

type TaskUpdateParseResult =
  | { success: true; data: TaskUpdateInput }
  | { success: false; error: string }

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key)
}

export function parseTaskUpdateInput(input: unknown): TaskUpdateParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, error: "Invalid task update" }
  }

  const record = input as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0 || keys.some((key) => !TASK_UPDATE_KEYS.has(key))) {
    return { success: false, error: "Invalid task update fields" }
  }

  const data: TaskUpdateInput = {}

  if (hasOwn(record, "title")) {
    if (typeof record.title !== "string" || !record.title.trim() || record.title.trim().length > 500) {
      return { success: false, error: "Task title must be between 1 and 500 characters" }
    }
    data.title = record.title.trim()
  }

  if (hasOwn(record, "description_rich_text")) {
    if (record.description_rich_text !== null && typeof record.description_rich_text !== "string") {
      return { success: false, error: "Invalid task description" }
    }
    if (typeof record.description_rich_text === "string" && record.description_rich_text.length > 100_000) {
      return { success: false, error: "Task description is too long" }
    }
    data.description_rich_text = record.description_rich_text as string | null
  }

  if (hasOwn(record, "status")) {
    if (typeof record.status !== "string" || !TASK_STATUSES.has(record.status)) {
      return { success: false, error: "Invalid task status" }
    }
    data.status = record.status as TaskUpdateInput["status"]
  }

  if (hasOwn(record, "priority")) {
    if (record.priority !== null && (typeof record.priority !== "string" || !TASK_PRIORITIES.has(record.priority))) {
      return { success: false, error: "Invalid task priority" }
    }
    data.priority = record.priority as TaskUpdateInput["priority"]
  }

  if (hasOwn(record, "due_date")) {
    const dueDate = record.due_date
    if (dueDate !== null && !(dueDate instanceof Date) && typeof dueDate !== "string") {
      return { success: false, error: "Invalid due date" }
    }
    if (dueDate instanceof Date && Number.isNaN(dueDate.getTime())) {
      return { success: false, error: "Invalid due date" }
    }
    if (typeof dueDate === "string" && dueDate !== "" && Number.isNaN(new Date(`${dueDate}T12:00:00`).getTime())) {
      return { success: false, error: "Invalid due date" }
    }
    data.due_date = dueDate === "" ? null : dueDate
  }

  for (const key of ["assignee_id", "project_id", "client_id", "section_id"] as const) {
    if (!hasOwn(record, key)) continue
    const value = record[key]
    if (value !== null && (typeof value !== "string" || !value.trim())) {
      return { success: false, error: `Invalid ${key}` }
    }
    data[key] = value as string | null
  }

  return { success: true, data }
}
