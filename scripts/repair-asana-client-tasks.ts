import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const IMPORTED_TASK_PREFIX = "mig_task_"
const IMPORTED_PROJECT_PREFIX = "mig_project_"
const UPDATE_BATCH_SIZE = 400

function parseSummary(value: string | null) {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

async function updateTaskClientIds(assignments: Map<string, string[]>) {
  let updated = 0

  for (const [clientId, taskIds] of assignments) {
    for (let offset = 0; offset < taskIds.length; offset += UPDATE_BATCH_SIZE) {
      const result = await prisma.task.updateMany({
        where: { id: { in: taskIds.slice(offset, offset + UPDATE_BATCH_SIZE) } },
        data: { client_id: clientId },
      })
      updated += result.count
    }
  }

  return updated
}

function groupAssignments(rows: Array<{ id: string; clientId: string }>) {
  const assignments = new Map<string, string[]>()

  for (const row of rows) {
    assignments.set(row.clientId, [
      ...(assignments.get(row.clientId) || []),
      row.id,
    ])
  }

  return assignments
}

async function main() {
  const importRun = await prisma.importRun.findFirst({
    where: { source: "asana_csv_package", status: "completed" },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      workspace_id: true,
      requested_by: true,
      summary_json: true,
    },
  })

  if (!importRun) {
    throw new Error("No completed Asana CSV package import was found")
  }

  const importedTasks = await prisma.task.findMany({
    where: {
      workspace_id: importRun.workspace_id,
      id: { startsWith: IMPORTED_TASK_PREFIX },
    },
    select: {
      id: true,
      client_id: true,
      project: { select: { client_id: true } },
    },
  })

  const projectClientAssignments = importedTasks
    .filter((task) => !task.client_id && task.project?.client_id)
    .map((task) => ({ id: task.id, clientId: task.project!.client_id! }))

  const assignedFromProject = await updateTaskClientIds(
    groupAssignments(projectClientAssignments)
  )

  const nestedTasks = await prisma.task.findMany({
    where: {
      workspace_id: importRun.workspace_id,
      id: { startsWith: IMPORTED_TASK_PREFIX },
      parent_task_id: { not: null },
    },
    select: {
      id: true,
      client_id: true,
      parent_task: { select: { client_id: true } },
    },
  })

  const parentClientAssignments = nestedTasks
    .filter(
      (task) =>
        task.parent_task?.client_id &&
        task.client_id !== task.parent_task.client_id
    )
    .map((task) => ({
      id: task.id,
      clientId: task.parent_task!.client_id!,
    }))

  const alignedWithParent = await updateTaskClientIds(
    groupAssignments(parentClientAssignments)
  )

  const detachedTasks = await prisma.task.updateMany({
    where: {
      workspace_id: importRun.workspace_id,
      id: { startsWith: IMPORTED_TASK_PREFIX },
      OR: [
        { project_id: { not: null } },
        { section_id: { not: null } },
      ],
    },
    data: {
      project_id: null,
      section_id: null,
    },
  })

 
  const hiddenSourceProjects = await prisma.project.updateMany({
    where: {
      workspace_id: importRun.workspace_id,
      id: { startsWith: IMPORTED_PROJECT_PREFIX },
      archived: false,
    },
    data: { archived: true },
  })

  const [
    taskCount,
    tasksStillInProjects,
    tasksStillInSections,
    topLevelClientTasks,
    parentLinks,
    taskProjectLinks,
    sourceProjects,
    visibleSourceProjects,
  ] = await Promise.all([
    prisma.task.count({
      where: {
        workspace_id: importRun.workspace_id,
        id: { startsWith: IMPORTED_TASK_PREFIX },
      },
    }),
    prisma.task.count({
      where: {
        workspace_id: importRun.workspace_id,
        id: { startsWith: IMPORTED_TASK_PREFIX },
        project_id: { not: null },
      },
    }),
    prisma.task.count({
      where: {
        workspace_id: importRun.workspace_id,
        id: { startsWith: IMPORTED_TASK_PREFIX },
        section_id: { not: null },
      },
    }),
    prisma.task.count({
      where: {
        workspace_id: importRun.workspace_id,
        id: { startsWith: IMPORTED_TASK_PREFIX },
        project_id: null,
        parent_task_id: null,
        client_id: { not: null },
      },
    }),
    prisma.task.count({
      where: {
        workspace_id: importRun.workspace_id,
        id: { startsWith: IMPORTED_TASK_PREFIX },
        parent_task_id: { not: null },
      },
    }),
    prisma.taskProjectLink.count({
      where: {
        task: {
          workspace_id: importRun.workspace_id,
          id: { startsWith: IMPORTED_TASK_PREFIX },
        },
      },
    }),
    prisma.project.count({
      where: {
        workspace_id: importRun.workspace_id,
        id: { startsWith: IMPORTED_PROJECT_PREFIX },
      },
    }),
    prisma.project.count({
      where: {
        workspace_id: importRun.workspace_id,
        id: { startsWith: IMPORTED_PROJECT_PREFIX },
        archived: false,
      },
    }),
  ])

  if (tasksStillInProjects !== 0 || tasksStillInSections !== 0) {
    throw new Error("Some imported tasks are still nested in source projects")
  }

  if (visibleSourceProjects !== 0) {
    throw new Error("Some imported source projects are still visible")
  }

  const repairSummary = {
    taskCount,
    detachedTasks: detachedTasks.count,
    assignedFromProject,
    alignedWithParent,
    topLevelClientTasks,
    parentLinks,
    taskProjectLinksPreserved: taskProjectLinks,
    sourceProjectsPreserved: sourceProjects,
    sourceProjectsHidden: sourceProjects,
  }

  await prisma.importRun.update({
    where: { id: importRun.id },
    data: {
      summary_json: JSON.stringify({
        ...parseSummary(importRun.summary_json),
        taskLayoutRepair: repairSummary,
      }),
    },
  })

  await prisma.activityLog.create({
    data: {
      workspace_id: importRun.workspace_id,
      actor_id: importRun.requested_by,
      entity_type: "workspace",
      entity_id: importRun.workspace_id,
      action: "asana_client_task_structure_repaired",
      meta_json: JSON.stringify(repairSummary),
    },
  })

  console.log(JSON.stringify(repairSummary, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
