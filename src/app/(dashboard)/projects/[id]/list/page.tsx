import { getServerSession } from "next-auth"
import Link from "next/link"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import ProjectAccessDenied from "@/components/project-access-denied"
import ListClient from "./list-client"
import ProjectViewTabs from "@/components/project-view-tabs"
import { isSuperAdminUser, projectAccessWhere } from "@/lib/permissions"
import ShareButton from "@/components/share-button"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"
import { ListTodo, Star } from "lucide-react"

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return null
  const userId = (session.user as { id?: string } | undefined)?.id
  if (!userId) return notFound()

  const canImport = await isSuperAdminUser(userId)
  const project = await prisma.project.findFirst({
    where: id !== "demo"
      ? { id, ...projectAccessWhere(userId, "view", canImport) }
      : { default_view: "list", ...projectAccessWhere(userId, "view", canImport) },
    include: {
      sections: {
        orderBy: { position: 'asc' },
        include: {
          tasks: {
            where: { archived: false },
            orderBy: { position: 'asc' },
              include: { 
                assignee: { select: USER_PUBLIC_SELECT }, 
                client: true,
                tags: { include: { tag: true } },
                comments: { include: { author: { select: USER_PUBLIC_SELECT } } },
                subtasks: true,
                attachments: true,
              }
            }
        }
      }
    }
  })

  if (!project) {
    if (id !== "demo") {
      const existingProject = await prisma.project.findUnique({ where: { id } })
      if (existingProject) {
        return <ProjectAccessDenied projectId={id} projectName={existingProject.name} />
      }
    }
    return notFound()
  }
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#1e1f21]">
      <div className="flex min-h-20 shrink-0 items-center justify-between gap-2 border-b border-[#414245] px-3 py-3 sm:gap-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: project.color || "#9f8fef" }}>
            <ListTodo className="h-5 w-5" />
          </div>
          <h1 className="truncate text-xl font-semibold tracking-[-0.025em] text-white/95">{project.name}</h1>
          <Star className="hidden h-4 w-4 text-white/35 sm:block" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`/api/export/projects/${project.id}/tasks`}
            className="hidden h-9 items-center rounded-md border border-[#56575a] px-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/5 hover:text-white sm:inline-flex"
          >
            Export CSV
          </a>
          {canImport ? (
            <Link
              href={`/import?targetType=existing_project&projectId=${project.id}`}
              className="hidden h-9 items-center rounded-md border border-[#56575a] px-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/5 hover:text-white lg:inline-flex"
            >
              Import CSV
            </Link>
          ) : null}
          <ShareButton className="inline-flex h-11 items-center rounded-md bg-[#4573d2] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#3f6bc5] sm:h-9 sm:px-4" />
        </div>
      </div>
      <ProjectViewTabs projectId={project.id} clientId={project.client_id} />
      <div className="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-auto p-4 custom-scrollbar sm:p-6">
        <ListClient project={project} />
      </div>
    </div>
  )
}
