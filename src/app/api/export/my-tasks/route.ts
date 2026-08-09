import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { tasksToCsv } from "@/lib/task-export"
import { getActiveWorkspaceForUser, taskAccessWhere } from "@/lib/permissions"

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const activeWorkspace = await getActiveWorkspaceForUser(userId)
  const tasks = activeWorkspace ? await prisma.task.findMany({
    where: {
      AND: [
        taskAccessWhere(userId, "view"),
        { workspace_id: activeWorkspace.id },
        { assignee_id: userId },
      ],
    },
    include: {
      assignee: { select: { full_name: true, email: true } },
      project: { select: { name: true } },
      section: { select: { name: true } },
      parent_task: { select: { id: true, title: true } },
      tags: { include: { tag: { select: { name: true } } } },
    },
    orderBy: [{ project_id: "asc" }, { parent_task_id: "asc" }, { position: "asc" }, { created_at: "asc" }],
  }) : []

  const csv = tasksToCsv(tasks)

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="my-tasks.csv"',
    },
  })
}
