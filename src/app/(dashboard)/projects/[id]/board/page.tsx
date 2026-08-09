import { getServerSession } from "next-auth"
import Link from "next/link"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import BoardClient from "./board-client"
import ProjectViewTabs from "@/components/project-view-tabs"
import { projectAccessWhere } from "@/lib/permissions"
import ShareButton from "@/components/share-button"
import { isSuperAdminUser } from "@/lib/permissions"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"
import { ListTodo, Star } from "lucide-react"

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return null
  const userId = (session.user as { id?: string } | undefined)?.id
  if (!userId) return null

  const canImport = await isSuperAdminUser(userId)
  const project = await prisma.project.findFirst({
    where: id !== "demo"
      ? { id, ...projectAccessWhere(userId, "view", canImport) }
      : { default_view: "board", ...projectAccessWhere(userId, "view", canImport) },
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
              attachments: true,
              comments: { include: { author: { select: USER_PUBLIC_SELECT } } },
              subtasks: true,
            }
          }
        }
      }
    }
  })

  if (!project) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-zinc-950 p-8 items-center justify-center text-center">
        <h2 className="text-xl font-semibold mb-2">Project not found</h2>
        <p className="text-gray-500 max-w-md">Make sure you have run the database migrations and seed script to populate the demo projects.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#1e1f21]">
      {/* Project Header */}
      <div className="flex min-h-20 shrink-0 items-center justify-between gap-2 border-b border-[#414245] bg-[#1e1f21] px-3 py-3 sm:gap-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: project.color || "#9f8fef" }}>
            <ListTodo className="h-5 w-5" />
          </div>
          <h1 className="truncate text-xl font-semibold tracking-[-0.025em] text-white/95">{project.name}</h1>
          <button className="hidden h-8 w-8 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/5 hover:text-white/80 sm:flex" aria-label="Star project">
            <Star className="h-4 w-4" />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="mr-1 hidden -space-x-1.5 sm:flex">
            <div className="h-8 w-8 rounded-full border-2 border-[#1e1f21] bg-[#b8b8b8]" />
            <div className="h-8 w-8 rounded-full border-2 border-[#1e1f21] bg-[#6cc3d5]" />
          </div>
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
      {/* View Tabs */}
      <ProjectViewTabs projectId={project.id} clientId={project.client_id} />
      {/* Board content */}
      <div className="min-h-0 flex-1 overflow-hidden bg-[#1e1f21] p-4 sm:p-6">
        <BoardClient project={project} />
      </div>
    </div>
  )
}
