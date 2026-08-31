import type { TaskWorkflowStageId } from "@/lib/workflow"
import { getTaskWorkflowStage, isTaskWorkflowStage, TASK_WORKFLOW_STAGE_IDS } from "@/lib/workflow"

export const CLIENT_TASK_BOARD_COLUMN_PAGE_SIZE = 20
export const CLIENT_TASK_LAYOUT_STORAGE_KEY = "client-task-layout"

export type ClientTaskLayout = "table" | "board"

export interface ClientTaskBoardColumnState {
  tasks: any[]
  page: number
  total: number
  totalPages: number
  loading: boolean
}

export function emptyClientTaskBoardCounts(): Record<TaskWorkflowStageId, number> {
  return Object.fromEntries(TASK_WORKFLOW_STAGE_IDS.map((stageId) => [stageId, 0])) as Record<TaskWorkflowStageId, number>
}

export function mergeClientTaskBoardCounts(
  groupedRows: Array<{ status: string; count: number }>,
): Record<TaskWorkflowStageId, number> {
  const counts = emptyClientTaskBoardCounts()
  for (const row of groupedRows) {
    if (row.status in counts) counts[row.status as TaskWorkflowStageId] = row.count
  }
  return counts
}

/**
 * Removes the task from every column and re-inserts it at the top of its new
 * status column when that column has loaded cards. Returns null when nothing
 * changed so callers can skip state updates.
 */
export function reconcileTaskAcrossBoardColumns(
  columns: Record<string, ClientTaskBoardColumnState>,
  updatedTask: any,
): Record<string, ClientTaskBoardColumnState> | null {
  if (!columns || !updatedTask?.id || !updatedTask.status) return null
  if (!(updatedTask.status in columns)) return null

  let originalTask: any = null
  const next: Record<string, ClientTaskBoardColumnState> = {}
  for (const [stageId, column] of Object.entries(columns)) {
    const found = column.tasks.find((task) => task.id === updatedTask.id)
    if (found) originalTask = found
    next[stageId] = found
      ? { ...column, tasks: column.tasks.filter((task) => task.id !== updatedTask.id) }
      : column
  }

  if (!originalTask) return null

  const destination = next[updatedTask.status]
  next[updatedTask.status] = {
    ...destination,
    tasks: [{ ...originalTask, ...updatedTask }, ...destination.tasks],
  }
  return next
}

/**
 * Optimistically moves one loaded card between columns before the authoritative
 * server response arrives. Returns null when the drag cannot be applied.
 */
export function moveTaskBetweenBoardColumns(
  columns: Record<string, ClientTaskBoardColumnState>,
  taskId: string,
  fromStage: string,
  toStage: string,
): { columns: Record<string, ClientTaskBoardColumnState>; task: any } | null {
  if (!columns[fromStage] || !columns[toStage]) return null
  const task = columns[fromStage].tasks.find((entry) => entry.id === taskId)
  if (!task) return null

  const next: Record<string, ClientTaskBoardColumnState> = {
    ...columns,
    [fromStage]: {
      ...columns[fromStage],
      tasks: columns[fromStage].tasks.filter((entry) => entry.id !== taskId),
      total: Math.max(0, columns[fromStage].total - 1),
      totalPages: Math.max(1, Math.ceil(Math.max(0, columns[fromStage].total - 1) / CLIENT_TASK_BOARD_COLUMN_PAGE_SIZE)),
    },
  }
  next[toStage] = {
    ...columns[toStage],
    tasks: [{ ...task, status: toStage }, ...columns[toStage].tasks],
    total: columns[toStage].total + 1,
    totalPages: Math.max(1, Math.ceil((columns[toStage].total + 1) / CLIENT_TASK_BOARD_COLUMN_PAGE_SIZE)),
  }
  return { columns: next, task }
}

export function insertCreatedTaskIntoBoardColumn(
  columns: Record<string, ClientTaskBoardColumnState>,
  task: any,
): Record<string, ClientTaskBoardColumnState> | null {
  if (!task?.id || !isTaskWorkflowStage(task.status)) return null
  // Quality-controlled buckets are entered through the review workflow only.
  if (!getTaskWorkflowStage(task.status).manualTransition) return null
  if (!(task.status in columns)) return null
  const column = columns[task.status]
  return {
    ...columns,
    [task.status]: { ...column, tasks: [task, ...column.tasks], total: column.total + 1 },
  }
}
