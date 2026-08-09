export interface TaskHistoryActor {
  full_name?: string | null
}

export interface TaskHistoryEntry {
  action: string
  meta_json?: string | null
  actor?: TaskHistoryActor | null
}

interface TaskHistoryMeta {
  source?: string
  from?: string | null
  to?: string | null
  title?: string
  fieldName?: string
  fromSectionName?: string | null
  toSectionName?: string | null
  rowNumber?: number
  fileName?: string
  bodyPreview?: string
  cycleNumber?: number
  qualityScore?: number | null
  reworkDueDate?: string | null
  grade?: string | null
}

function parseMeta(metaJson?: string | null): TaskHistoryMeta | null {
  if (!metaJson) return null

  try {
    return JSON.parse(metaJson) as TaskHistoryMeta
  } catch {
    return null
  }
}

function formatValueChange(label: string, from?: string | null, to?: string | null) {
  return {
    title: label,
    detail: `${from || "empty"} -> ${to || "empty"}`,
  }
}

export function describeTaskHistory(entry: TaskHistoryEntry) {
  const meta = parseMeta(entry.meta_json)
  const actor = entry.actor?.full_name || "System"
  const sourceSuffix = meta?.source === "import" ? " via CSV import" : meta?.source === "manual" ? " manually" : ""

  switch (entry.action) {
    case "task_created":
      return {
        title: `${actor} created the task${sourceSuffix}`,
        detail: meta?.title || null,
      }
    case "task_imported":
      return {
        title: `${actor} imported the task from CSV`,
        detail: meta?.fileName ? `Source: ${meta.fileName}${meta.rowNumber ? `, row ${meta.rowNumber}` : ""}` : null,
      }
    case "task_custom_field_set":
      return {
        title: `${actor} set custom field ${meta?.fieldName || "value"}`,
        detail: meta?.to || null,
      }
    case "task_title_changed":
      return formatValueChange(`${actor} changed the title`, meta?.from, meta?.to)
    case "task_description_changed":
      return {
        title: `${actor} updated the description`,
        detail: meta?.to ? "Description edited" : "Description removed",
      }
    case "task_status_changed":
      return formatValueChange(`${actor} changed the status`, meta?.from, meta?.to)
    case "task_completed":
      return {
        title: `${actor} marked the task complete`,
        detail: null,
      }
    case "task_reopened":
      return {
        title: `${actor} marked the task incomplete`,
        detail: null,
      }
    case "quality_review_enabled":
      return {
        title: `${actor} enabled quality review`,
        detail: "Acceptance criteria and reviewer added",
      }
    case "quality_review_started":
      return {
        title: `${actor} started a quality review`,
        detail: "The completed task is awaiting a quality decision",
      }
    case "quality_review_disabled":
      return {
        title: `${actor} disabled quality review`,
        detail: null,
      }
    case "quality_reviewer_changed":
      return {
        title: `${actor} reassigned the quality review`,
        detail: null,
      }
    case "quality_submitted":
    case "quality_resubmitted":
      return {
        title: `${actor} ${entry.action === "quality_submitted" ? "submitted" : "resubmitted"} the task for review`,
        detail: meta?.cycleNumber ? `Review cycle ${meta.cycleNumber}` : null,
      }
    case "quality_rework_requested":
      return {
        title: `${actor} requested quality rework`,
        detail: `${meta?.grade ? `${meta.grade.replace(/_/g, " ")} · ` : ""}${meta?.reworkDueDate ? `Rework due ${new Date(meta.reworkDueDate).toLocaleDateString()}` : "Changes requested"}`,
      }
    case "quality_approved":
      return {
        title: `${actor} approved the task`,
        detail: `${meta?.grade ? `${meta.grade.replace(/_/g, " ")} · ` : ""}${typeof meta?.qualityScore === "number" ? `KPI score ${meta.qualityScore}` : "Approved"}`,
      }
    case "task_priority_changed":
      return formatValueChange(`${actor} changed the priority`, meta?.from, meta?.to)
    case "task_due_date_changed":
      return formatValueChange(`${actor} changed the due date`, meta?.from, meta?.to)
    case "task_start_date_changed":
      return formatValueChange(`${actor} changed the start date`, meta?.from, meta?.to)
    case "task_assignee_changed":
      return formatValueChange(`${actor} changed the assignee`, meta?.from, meta?.to)
    case "task_project_changed":
      return formatValueChange(`${actor} changed the project`, meta?.from, meta?.to)
    case "task_client_changed":
      return formatValueChange(`${actor} changed the client`, meta?.from, meta?.to)
    case "task_converted_to_project":
      return {
        title: `${actor} converted the task into a project`,
        detail: meta?.title || meta?.to || null,
      }
    case "task_section_changed":
      return formatValueChange(`${actor} changed the section`, meta?.from, meta?.to)
    case "task_moved":
      return {
        title: `${actor} moved the task`,
        detail: `${meta?.fromSectionName || "Unknown"} -> ${meta?.toSectionName || "Unknown"}`,
      }
    case "comment_added":
    case "task_comment_added":
      return {
        title: `${actor} added a comment`,
        detail: meta?.bodyPreview || null,
      }
    case "subtask_created":
      return {
        title: `${actor} created a subtask`,
        detail: meta?.title || null,
      }
    case "subtask_completed":
      return {
        title: `${actor} completed a subtask`,
        detail: null,
      }
    case "subtask_reopened":
      return {
        title: `${actor} reopened a subtask`,
        detail: null,
      }
    case "subtask_deleted":
      return {
        title: `${actor} deleted a subtask`,
        detail: null,
      }
    case "attachment_added":
      return {
        title: `${actor} added an attachment`,
        detail: meta?.title || meta?.to || null,
      }
    case "attachment_removed":
      return {
        title: `${actor} removed an attachment`,
        detail: meta?.title || meta?.from || null,
      }
    default:
      return {
        title: `${actor} ${entry.action.replace(/_/g, " ")}`,
        detail: null,
      }
  }
}
