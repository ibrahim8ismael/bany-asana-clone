const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

async function main() {
  const [
    clients,
    projects,
    archivedProjects,
    visibleProjects,
    sections,
    tasks,
    completeTasks,
    openTasks,
    parentedTasks,
    parentedTasksWithSection,
    tasksStillInProjects,
    topLevelClientTasks,
    importedTasksWithoutClient,
    assignedTasks,
    taskProjectLinks,
    peopleCreated,
    attachments,
    importRun,
    totals,
  ] = await Promise.all([
    prisma.client.count({ where: { id: { startsWith: "mig_client_" } } }),
    prisma.project.count({ where: { id: { startsWith: "mig_project_" } } }),
    prisma.project.count({
      where: { id: { startsWith: "mig_project_" }, archived: true },
    }),
    prisma.project.count({
      where: { id: { startsWith: "mig_project_" }, archived: false },
    }),
    prisma.section.count({ where: { id: { startsWith: "mig_section_" } } }),
    prisma.task.count({ where: { id: { startsWith: "mig_task_" } } }),
    prisma.task.count({
      where: { id: { startsWith: "mig_task_" }, status: "complete" },
    }),
    prisma.task.count({
      where: {
        id: { startsWith: "mig_task_" },
        status: { not: "complete" },
      },
    }),
    prisma.task.count({
      where: {
        id: { startsWith: "mig_task_" },
        parent_task_id: { not: null },
      },
    }),
    prisma.task.count({
      where: {
        id: { startsWith: "mig_task_" },
        parent_task_id: { not: null },
        section_id: { not: null },
      },
    }),
    prisma.task.count({
      where: { id: { startsWith: "mig_task_" }, project_id: { not: null } },
    }),
    prisma.task.count({
      where: {
        id: { startsWith: "mig_task_" },
        project_id: null,
        parent_task_id: null,
        client_id: { not: null },
      },
    }),
    prisma.task.count({
      where: { id: { startsWith: "mig_task_" }, client_id: null },
    }),
    prisma.task.count({
      where: {
        id: { startsWith: "mig_task_" },
        assignee_id: { not: null },
      },
    }),
    prisma.taskProjectLink.count({
      where: { task: { id: { startsWith: "mig_task_" } } },
    }),
    prisma.user.count({ where: { id: { startsWith: "mig_person_" } } }),
    prisma.attachment.count({
      where: { task: { id: { startsWith: "mig_task_" } } },
    }),
    prisma.importRun.findFirst({
      where: { source: "asana_csv_package" },
      orderBy: { created_at: "desc" },
      select: {
        status: true,
        phase: true,
        summary_json: true,
        _count: { select: { issues: true } },
      },
    }),
    Promise.all([
      prisma.client.count(),
      prisma.project.count(),
      prisma.task.count(),
      prisma.user.count(),
    ]),
  ])

  console.log(
    JSON.stringify(
      {
        imported: {
          clients,
          projects,
          archivedProjects,
          visibleProjects,
          sections,
          tasks,
          completeTasks,
          openTasks,
          parentedTasks,
          parentedTasksWithSection,
          tasksStillInProjects,
          topLevelClientTasks,
          importedTasksWithoutClient,
          assignedTasks,
          taskProjectLinks,
          peopleCreated,
          attachments,
        },
        importRun,
        totals: {
          clients: totals[0],
          projects: totals[1],
          tasks: totals[2],
          users: totals[3],
        },
      },
      null,
      2
    )
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
