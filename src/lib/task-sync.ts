export interface SyncableTask {
  id: string
  project_id?: string | null
  section_id?: string | null
  assignee_id?: string | null
  [key: string]: unknown
}

export interface TaskSection<T extends SyncableTask = SyncableTask> {
  id: string
  tasks: T[]
  [key: string]: unknown
}

interface SyncVisibility {
  projectId?: string
  assigneeId?: string
}

function shouldKeepTask<T extends SyncableTask>(task: T, visibility: SyncVisibility) {
  if (visibility.projectId !== undefined && task.project_id !== visibility.projectId) {
    return false
  }

  if (visibility.assigneeId !== undefined && task.assignee_id !== visibility.assigneeId) {
    return false
  }

  return true
}

export function syncTaskInList<T extends SyncableTask>(
  tasks: T[],
  updatedTask: T,
  visibility: SyncVisibility = {}
) {
  const existingIndex = tasks.findIndex((task) => task.id === updatedTask.id)
  const visible = shouldKeepTask(updatedTask, visibility)

  if (!visible) {
    return tasks.filter((task) => task.id !== updatedTask.id)
  }

  if (existingIndex === -1) {
    return [updatedTask, ...tasks]
  }

  return tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task))
}

export function syncTaskInSections<T extends SyncableTask, S extends TaskSection<T>>(
  sections: S[],
  updatedTask: T,
  visibility: SyncVisibility = {}
) {
  const visible = shouldKeepTask(updatedTask, visibility)
  const targetSectionId = visible ? updatedTask.section_id ?? null : null

  return sections.map((section) => {
    const existingIndex = section.tasks.findIndex((task) => task.id === updatedTask.id)
    const filteredTasks = section.tasks.filter((task) => task.id !== updatedTask.id)

    if (targetSectionId !== section.id) {
      return { ...section, tasks: filteredTasks }
    }

    if (existingIndex >= 0) {
      const nextTasks = [...filteredTasks]
      const insertIndex = Math.min(existingIndex, nextTasks.length)
      nextTasks.splice(insertIndex, 0, updatedTask)
      return { ...section, tasks: nextTasks }
    }

    return { ...section, tasks: [...filteredTasks, updatedTask] }
  })
}
