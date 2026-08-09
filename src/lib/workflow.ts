export const TASK_WORKFLOW_STAGE_IDS = [
  "backlog",
  "incomplete",
  "in_progress",
  "submitted_for_review",
  "needs_rework",
  "complete",
] as const

export type TaskWorkflowStageId = (typeof TASK_WORKFLOW_STAGE_IDS)[number]

export const TASK_WORKFLOW_STAGES = [
  {
    id: "backlog",
    label: "Backlog",
    accent: "bg-zinc-500",
    textAccent: "text-zinc-500",
    badgeClass: "bg-zinc-500/10 text-zinc-500",
    appliesTo: ["task"] as const,
    manualTransition: true,
    allowedTransitions: ["incomplete", "in_progress", "complete"] as const,
  },
  {
    id: "incomplete",
    label: "To Do",
    accent: "bg-zinc-400",
    textAccent: "text-zinc-400",
    badgeClass: "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400",
    appliesTo: ["task"] as const,
    manualTransition: true,
    allowedTransitions: ["backlog", "in_progress", "complete"] as const,
  },
  {
    id: "in_progress",
    label: "In Progress",
    accent: "bg-blue-500",
    textAccent: "text-blue-400",
    badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    appliesTo: ["task"] as const,
    manualTransition: true,
    allowedTransitions: ["backlog", "incomplete", "complete"] as const,
  },
  {
    id: "submitted_for_review",
    label: "In Review",
    accent: "bg-amber-500",
    textAccent: "text-amber-400",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    appliesTo: ["task", "quality_review"] as const,
    manualTransition: false,
    allowedTransitions: ["needs_rework", "complete"] as const,
  },
  {
    id: "needs_rework",
    label: "Needs Rework",
    accent: "bg-rose-500",
    textAccent: "text-rose-400",
    badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
    appliesTo: ["task", "quality_review"] as const,
    manualTransition: false,
    allowedTransitions: ["submitted_for_review"] as const,
  },
  {
    id: "complete",
    label: "Done",
    accent: "bg-emerald-500",
    textAccent: "text-emerald-400",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    appliesTo: ["task"] as const,
    manualTransition: true,
    allowedTransitions: ["backlog", "incomplete", "in_progress"] as const,
  },
] as const satisfies ReadonlyArray<{
  id: TaskWorkflowStageId
  label: string
  accent: string
  textAccent: string
  badgeClass: string
  appliesTo: readonly ("task" | "quality_review")[]
  manualTransition: boolean
  allowedTransitions: readonly TaskWorkflowStageId[]
}>

export const PROJECT_STATUS_IDS = ["incomplete", "in_progress", "complete"] as const
export type ProjectStatusId = (typeof PROJECT_STATUS_IDS)[number]

export const QUALITY_STATE_IDS = [
  "not_required",
  "ready",
  "submitted",
  "needs_rework",
  "approved",
  "approved_with_notes",
] as const
export type TaskQualityState = (typeof QUALITY_STATE_IDS)[number]

const TASK_STATUS_SET = new Set<string>(TASK_WORKFLOW_STAGE_IDS)
const PROJECT_STATUS_SET = new Set<string>(PROJECT_STATUS_IDS)
const QUALITY_STATE_SET = new Set<string>(QUALITY_STATE_IDS)

export function isTaskWorkflowStage(value: unknown): value is TaskWorkflowStageId {
  return typeof value === "string" && TASK_STATUS_SET.has(value)
}

export function isProjectStatus(value: unknown): value is ProjectStatusId {
  return typeof value === "string" && PROJECT_STATUS_SET.has(value)
}

export function isTaskQualityState(value: unknown): value is TaskQualityState {
  return typeof value === "string" && QUALITY_STATE_SET.has(value)
}

export function getTaskWorkflowStage(status: TaskWorkflowStageId) {
  return TASK_WORKFLOW_STAGES.find((stage) => stage.id === status)!
}

export function getTaskWorkflowLabel(status: string) {
  return isTaskWorkflowStage(status) ? getTaskWorkflowStage(status).label : status.replace(/_/g, " ")
}

export type ManualTaskTransitionContext = {
  from: string
  to: string
  qualityRequired: boolean
  qualityState: string
}

export function validateManualTaskTransition(context: ManualTaskTransitionContext): string | null {
  if (!isTaskWorkflowStage(context.from) || !isTaskWorkflowStage(context.to)) {
    return "Unsupported task workflow stage"
  }

  if (context.from === context.to) return null

  const destination = getTaskWorkflowStage(context.to)
  if (!destination.manualTransition) {
    return `${destination.label} is controlled by the quality review workflow`
  }

  if (["submitted_for_review", "needs_rework"].includes(context.from)) {
    return "Use the quality review workflow to change this task's status"
  }

  if (["submitted", "needs_rework", "approved", "approved_with_notes"].includes(context.qualityState)) {
    return "Use the quality review workflow to change this task's status"
  }

  if (context.to === "complete" && context.qualityRequired) {
    return "Quality-controlled tasks must be approved before completion"
  }

  const source = getTaskWorkflowStage(context.from)
  if (!(source.allowedTransitions as readonly string[]).includes(context.to)) {
    return `Tasks cannot move directly from ${source.label} to ${destination.label}`
  }

  return null
}

export function isQualityWorkflowStatusConsistent(status: string, qualityState: string) {
  if (status === "submitted_for_review") return qualityState === "submitted"
  if (status === "needs_rework") return qualityState === "needs_rework"
  if (status === "complete" && ["submitted", "needs_rework"].includes(qualityState)) return false
  return true
}

export function deriveProjectCompletionStatus(
  currentStatus: string,
  taskStatuses: readonly string[]
): ProjectStatusId {
  const safeCurrentStatus: ProjectStatusId = isProjectStatus(currentStatus) ? currentStatus : "incomplete"

  if (taskStatuses.length === 0) {
    return safeCurrentStatus === "complete" ? "incomplete" : safeCurrentStatus
  }

  if (taskStatuses.every((status) => status === "complete")) return "complete"
  return safeCurrentStatus === "complete" ? "in_progress" : safeCurrentStatus
}
