import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Sidebar from "@/components/sidebar"
import Topbar from "@/components/topbar"
import { getSidebarData } from "@/lib/dashboard-data"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect("/login")
  }

  const userId = (session.user as { id?: string } | undefined)?.id
  if (!userId) {
    redirect("/login")
  }

  const [{ workspace, workspaces, clients, starredProjects, canImport, isSuperAdmin, myTasksBadgeCount }, currentUser, unreadNotifications] = await Promise.all([
    getSidebarData(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { full_name: true, email: true, avatar_url: true },
    }),
    prisma.notification.count({
      where: {
        user_id: userId,
        is_read: false,
        OR: [{ snoozed_until: null }, { snoozed_until: { lte: new Date() } }],
      },
    }),
  ])

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-[#1e1f21]">
      <Sidebar workspace={workspace} workspaces={workspaces} clients={clients} starredProjects={starredProjects} canImport={canImport} isSuperAdmin={isSuperAdmin} myTasksBadgeCount={myTasksBadgeCount} />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <Topbar
          user={currentUser ? { name: currentUser.full_name, email: currentUser.email, image: currentUser.avatar_url } : session.user}
          hasUnreadNotifications={unreadNotifications > 0}
        />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#1e1f21]">
          {children}
        </main>
      </div>
    </div>
  )
}
