import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getActiveWorkspaceForUser, isSuperAdminUser, taskAccessWhere, workspaceAccessWhere } from "@/lib/permissions"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"
import { TASK_CARD_SELECT } from "@/lib/task-card-select"
import { isWorkspaceAdmin } from "@/lib/project-membership"
import PeopleTasksClient from "@/components/people-tasks-client"

export default async function PeopleTasksPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId: targetUserId } = await params
  const session = await getServerSession(authOptions)
  const currentUserId = (session?.user as { id?: string } | undefined)?.id
  if (!currentUserId) redirect("/login")

  const [activeWorkspace, superAdmin] = await Promise.all([
    getActiveWorkspaceForUser(currentUserId),
    isSuperAdminUser(currentUserId),
  ])
  if (!activeWorkspace) redirect("/login")

  // Only admin / owner / super admin can view people tasks
  const workspaces = await prisma.workspace.findMany({
    where: workspaceAccessWhere(currentUserId, "view", superAdmin),
    select: { id: true, owner_id: true, members: { where: { user_id: currentUserId }, select: { role: true } } },
  })
  const active = workspaces.find((w) => w.id === activeWorkspace.id)
  const role = active ? (active.owner_id === currentUserId ? "owner" : active.members[0]?.role ?? "member") : "member"
  const canAdmin = Boolean(superAdmin || isWorkspaceAdmin(role))
  if (!canAdmin) redirect("/account")

  // Verify target is member of same workspace
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspace_id: activeWorkspace.id, user_id: targetUserId },
    select: { role: true, user: { select: USER_PUBLIC_SELECT } },
  })
  if (!membership) notFound()

  const targetUser = membership.user

  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        taskAccessWhere(currentUserId, "view", superAdmin),
        {
          workspace_id: activeWorkspace.id,
          archived: false,
          assignee_id: targetUserId,
          status: { not: "complete" },
        },
      ],
    },
    select: TASK_CARD_SELECT,
    orderBy: [{ due_date: "asc" }, { priority: "desc" }, { updated_at: "desc" }],
    take: 150,
  })

  return (
    <div className="h-full min-h-0 overflow-hidden bg-[#18181b]">
      <PeopleTasksClient
        targetUser={targetUser as { id: string; full_name: string; email: string; avatar_url: string | null }}
        tasks={tasks}
        workspaceName={activeWorkspace.name}
      />
    </div>
  )
}
