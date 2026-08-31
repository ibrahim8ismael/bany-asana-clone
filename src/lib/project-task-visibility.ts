type ProjectTask = {
  id: string
  position?: number | null
}

type ProjectSection<TTask extends ProjectTask> = {
  tasks: TTask[]
}

/**
 * Board and List render section task arrays. Keep legacy project tasks that do
 * not have a section visible by placing them in the project's first section
 * for presentation; new writes enforce a persisted section assignment.
 */
export function mergeUnsectionedProjectTasksIntoSections<
  TTask extends ProjectTask,
  TSection extends ProjectSection<TTask>,
  TProject extends { sections: TSection[]; tasks: TTask[] },
>(project: TProject): TProject {
  if (project.tasks.length === 0 || project.sections.length === 0) return project

  const [firstSection, ...remainingSections] = project.sections
  const firstSectionTasks = [...project.tasks, ...firstSection.tasks].sort(
    (left, right) => (left.position ?? 0) - (right.position ?? 0),
  )

  return {
    ...project,
    sections: [
      { ...firstSection, tasks: firstSectionTasks },
      ...remainingSections,
    ],
  }
}
