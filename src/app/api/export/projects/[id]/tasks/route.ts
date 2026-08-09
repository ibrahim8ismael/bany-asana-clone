import type { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getAccessibleProjectContext } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { tasksToCsv, toCsvFilename } from "@/lib/task-export"

export async function GET(_request: NextRequest, context: RouteContext<"/api/export/projects/[id]/tasks">) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { id } = await context.params
  const project = await getAccessibleProjectContext(userId, id, "view")
  if (!project) {
    return new Response("Not found", { status: 404 })
  }

  const tasks = await prisma.task.findMany({
    where: { project_id: project.id },
    include: {
      assignee: { select: { full_name: true, email: true } },
      project: { select: { name: true } },
      section: { select: { name: true } },
      parent_task: { select: { id: true, title: true } },
      tags: { include: { tag: { select: { name: true } } } },
    },
    orderBy: [{ parent_task_id: "asc" }, { position: "asc" }, { created_at: "asc" }],
  })

  const projectRecord = await prisma.project.findUnique({
    where: { id: project.id },
    select: { name: true },
  })

  const csv = tasksToCsv(tasks)
  const filename = `${toCsvFilename(projectRecord?.name || "project")}-tasks.csv`

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
