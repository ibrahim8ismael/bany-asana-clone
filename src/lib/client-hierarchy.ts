export const DIRECT_CLIENT_TASK_SCOPE = {
  project_id: null,
  parent_task_id: null,
  archived: false,
} as const

export function keepDirectClientTasks<T extends { project_id?: string | null }>(tasks: readonly T[]) {
  return tasks.filter((task) => task.project_id == null)
}
