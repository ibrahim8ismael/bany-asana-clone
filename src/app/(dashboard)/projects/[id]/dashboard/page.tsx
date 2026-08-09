import { getServerSession } from "next-auth"
import { notFound, redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isSuperAdminUser, projectAccessWhere } from "@/lib/permissions"
import ProjectAccessDenied from "@/components/project-access-denied"

export default async function ProjectDashboardRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) redirect("/clients")

  const isSuperAdmin = await isSuperAdminUser(userId)
  const project = await prisma.project.findFirst({
    where: { id, ...projectAccessWhere(userId, "view", isSuperAdmin) },
    select: { id: true, client_id: true },
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

  redirect(project.client_id ? `/clients?clientId=${project.client_id}` : `/projects/${project.id}/overview`)
}
