import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isSuperAdminUser } from "@/lib/permissions"
import ImportClient from "./import-client"

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ projectId?: string; targetType?: string }> }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId) {
    redirect("/login")
  }

  const isSuperAdmin = await isSuperAdminUser(userId)
  if (!isSuperAdmin) {
    return (
      <div className="h-full min-h-0 overflow-auto custom-scrollbar bg-[#1e1f21] p-10">
        <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-[#262729] p-8 text-center">
          <h1 className="text-2xl font-semibold text-white/90">Import is super-admin only</h1>
          <p className="text-sm text-white/45 mt-3">Open your account page and request elevated access if you need protected CSV import tools.</p>
        </div>
      </div>
    )
  }

  const { projectId, targetType } = await searchParams

  const [workspaces, projects] = await Promise.all([
    prisma.workspace.findMany({
      select: { id: true, name: true },
      orderBy: { created_at: "asc" },
    }),
    prisma.project.findMany({
      where: { archived: false },
      select: { id: true, name: true, workspace_id: true },
      orderBy: { updated_at: "desc" },
    }),
  ])

  return (
    <ImportClient
      workspaces={workspaces}
      projects={projects}
      initialProjectId={projectId || null}
      initialTargetType={targetType === "personal" ? "personal" : projectId ? "existing_project" : "new_project"}
    />
  )
}
