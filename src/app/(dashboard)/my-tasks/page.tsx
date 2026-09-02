import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import MyTasksClient from "@/components/my-tasks-client"
import { getActiveWorkspaceForUser, isSuperAdminUser, taskAccessWhere } from "@/lib/permissions"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"
import { COMPLETED_TASKS_PAGE_SIZE } from "@/lib/pagination"

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string }>
}) {
  const session = await getServerSession(authOptions)
  const { taskId: requestedTaskId } = await searchParams
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId) {
    return (
      <div className="flex items-center justify-center h-full text-white/50">
        Loading workspace...
      </div>
    )
  }

  const [activeWorkspace, superAdmin] = await Promise.all([
    getActiveWorkspaceForUser(userId),
    isSuperAdminUser(userId),
  ])

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center h-full text-white/50">
        No workspace found.
      </div>
    )
  }

  const baseIncompleteWhere = {
    AND: [
      taskAccessWhere(userId, "view", superAdmin),
      { workspace_id: activeWorkspace.id },
      { archived: false, status: { not: "complete" } },
      {
        OR: [
          { assignee_id: userId },
          { creator_id: userId, project_id: null, client_id: null },
        ],
      },
    ],
  }

  const baseCompletedWhere = {
    AND: [
      taskAccessWhere(userId, "view", superAdmin),
      { workspace_id: activeWorkspace.id },
      { archived: false, status: "complete" },
      {
        OR: [
          { assignee_id: userId },
          { creator_id: userId, project_id: null, client_id: null },
        ],
      },
    ],
  }

  const taskInclude = {
    project: true,
    client: true,
    section: true,
    assignee: { select: USER_PUBLIC_SELECT },
    reviewer: { select: USER_PUBLIC_SELECT },
    tags: { include: { tag: true } },
    comments: { include: { author: { select: USER_PUBLIC_SELECT } } },
    subtasks: true,
    attachments: true,
  } as const

  const [
    tasks,
    completedCount,
    completedTasks,
    pendingReviewTasks,
    reworkTasks,
    personalSections,
  ] = await Promise.all([
    prisma.task.findMany({
      where: baseIncompleteWhere,
      include: taskInclude,
      orderBy: { created_at: "desc" },
    }),
    prisma.task.count({ where: baseCompletedWhere }),
    prisma.task.findMany({
      where: baseCompletedWhere,
      include: taskInclude,
      orderBy: [{ completed_at: "desc" }, { updated_at: "desc" }, { id: "asc" }],
      take: COMPLETED_TASKS_PAGE_SIZE,
    }),
    prisma.task.findMany({
      where: {
        AND: [
          taskAccessWhere(userId, "view", superAdmin),
          {
            workspace_id: activeWorkspace.id,
            archived: false,
            reviewer_id: userId,
            status: "submitted_for_review",
            quality_state: "submitted",
          },
        ],
      },
      include: {
        project: true,
        client: true,
        section: true,
        assignee: { select: USER_PUBLIC_SELECT },
        reviewer: { select: USER_PUBLIC_SELECT },
        tags: { include: { tag: true } },
        comments: { include: { author: { select: USER_PUBLIC_SELECT } } },
        subtasks: true,
        attachments: true,
        quality_reviews: {
          where: { status: "pending" },
          orderBy: { cycle_number: "desc" },
          take: 1,
        },
      },
      orderBy: { updated_at: "asc" },
    }),
    prisma.task.findMany({
      where: {
        AND: [
          taskAccessWhere(userId, "view", superAdmin),
          {
            workspace_id: activeWorkspace.id,
            archived: false,
            status: "needs_rework",
            quality_state: "needs_rework",
            OR: [
              { assignee_id: userId },
              { assignee_id: null, creator_id: userId },
            ],
          },
        ],
      },
      include: {
        project: true,
        client: true,
        section: true,
        assignee: { select: USER_PUBLIC_SELECT },
        reviewer: { select: USER_PUBLIC_SELECT },
        tags: { include: { tag: true } },
        comments: { include: { author: { select: USER_PUBLIC_SELECT } } },
        subtasks: true,
        attachments: true,
        quality_reviews: {
          where: { status: "needs_rework" },
          orderBy: { cycle_number: "desc" },
          take: 1,
          include: { issues: true },
        },
      },
      orderBy: { rework_due_date: "asc" },
    }),
    prisma.section.findMany({
      where: { user_id: userId },
      orderBy: { position: "asc" },
      include: {
        tasks: {
          where: {
            AND: [
              taskAccessWhere(userId, "view", superAdmin),
              { workspace_id: activeWorkspace.id },
              { archived: false, status: { not: "complete" } },
              {
                OR: [
                  { assignee_id: userId },
                  { creator_id: userId, project_id: null, client_id: null },
                ],
              },
            ],
          },
          include: {
            project: true,
            client: true,
            assignee: { select: USER_PUBLIC_SELECT },
            reviewer: { select: USER_PUBLIC_SELECT },
            tags: { include: { tag: true } },
            comments: { include: { author: { select: USER_PUBLIC_SELECT } } },
            subtasks: true,
            attachments: true,
          },
        },
      },
    }),
  ])

  // Global search links unassigned tasks here. Keep the normal page personal,
  // but load an explicitly requested task when the caller is authorized.
  let requestedCompletedTask: typeof completedTasks[number] | null = null
  if (
    requestedTaskId &&
    !tasks.some((task) => task.id === requestedTaskId) &&
    !completedTasks.some((task) => task.id === requestedTaskId)
  ) {
    const requestedTask = await prisma.task.findFirst({
      where: {
        id: requestedTaskId,
        AND: [
          taskAccessWhere(userId, "view", superAdmin),
          { workspace_id: activeWorkspace.id },
        ],
      },
      include: taskInclude,
    })

    if (requestedTask) {
      if (requestedTask.status === "complete") {
        requestedCompletedTask = requestedTask as typeof completedTasks[number]
        // Prepend to first page if not already included
        if (!completedTasks.some((t) => t.id === requestedTask.id)) {
          completedTasks.unshift(requestedTask as typeof completedTasks[number])
        }
      } else {
        tasks.unshift(requestedTask)
      }
    }
  }

  const canImport = superAdmin
  const completedTotalPages = Math.max(1, Math.ceil(completedCount / COMPLETED_TASKS_PAGE_SIZE))

  return (
    <div className="h-full min-h-0 overflow-hidden bg-[#1e1f21]">
      <MyTasksClient 
        initialTasks={tasks} 
        initialSections={personalSections}
        initialPendingReviewTasks={pendingReviewTasks}
        initialReworkTasks={reworkTasks}
        initialCompletedTasks={completedTasks}
        completedTotal={completedCount}
        completedTotalPages={completedTotalPages}
        userId={userId}
        userName={session?.user?.name || "User"}
        canImport={canImport}
      />
    </div>
  )
}
