import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import MyTasksClient from "@/components/my-tasks-client"
import { getActiveWorkspaceForUser, isSuperAdminUser, taskAccessWhere } from "@/lib/permissions"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"

export default async function MyTasksPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId) {
    return (
      <div className="flex items-center justify-center h-full text-white/50">
        Loading workspace...
      </div>
    )
  }

  const activeWorkspace = await getActiveWorkspaceForUser(userId)

  const tasks = activeWorkspace ? await prisma.task.findMany({
    where: {
      AND: [
        taskAccessWhere(userId, "view"),
        { workspace_id: activeWorkspace.id },
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
      section: true,
      assignee: { select: USER_PUBLIC_SELECT },
      reviewer: { select: USER_PUBLIC_SELECT },
      tags: { include: { tag: true } },
      comments: { include: { author: { select: USER_PUBLIC_SELECT } } },
      subtasks: true,
      attachments: true,
    },
    orderBy: { created_at: "desc" },
  }) : []

  const pendingReviewTasks = activeWorkspace ? await prisma.task.findMany({
    where: {
      AND: [
        taskAccessWhere(userId, "view"),
        {
          workspace_id: activeWorkspace.id,
          archived: false,
          reviewer_id: userId,
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
  }) : []

  const reworkTasks = activeWorkspace ? await prisma.task.findMany({
    where: {
      AND: [
        taskAccessWhere(userId, "view"),
        {
          workspace_id: activeWorkspace.id,
          archived: false,
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
  }) : []

  const personalSections = activeWorkspace ? await prisma.section.findMany({
    where: { user_id: userId },
    orderBy: { position: "asc" },
    include: {
      tasks: {
        where: {
          AND: [
            taskAccessWhere(userId, "view"),
            { workspace_id: activeWorkspace.id },
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
        }
      }
    }
  }) : []

  const canImport = await isSuperAdminUser(userId)

  return (
    <div className="h-full min-h-0 overflow-hidden bg-[#1e1f21]">
      <MyTasksClient 
        initialTasks={tasks} 
        initialSections={personalSections}
        initialPendingReviewTasks={pendingReviewTasks}
        initialReworkTasks={reworkTasks}
        userId={userId}
        userName={session?.user?.name || "User"}
        canImport={canImport}
      />
    </div>
  )
}
