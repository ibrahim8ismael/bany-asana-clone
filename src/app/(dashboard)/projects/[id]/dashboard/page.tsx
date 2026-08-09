import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isSuperAdminUser, projectAccessWhere } from "@/lib/permissions"

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
    redirect("/clients")
  }

  redirect(project.client_id ? `/clients?clientId=${project.client_id}` : `/projects/${project.id}/overview`)
}
