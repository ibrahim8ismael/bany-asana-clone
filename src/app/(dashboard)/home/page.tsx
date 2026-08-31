import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Link from "next/link"
import { CheckCircle, Clock, Flag, FolderOpen, Zap } from "lucide-react"
import { DueDateBadge } from "@/components/due-date-badge"
import { getActiveWorkspaceForUser, isSuperAdminUser, projectAccessWhere, taskAccessWhere } from "@/lib/permissions"

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  const userName = session?.user?.name?.split(" ")[0] || "there"
  const [activeWorkspace, superAdmin] = userId
    ? await Promise.all([getActiveWorkspaceForUser(userId), isSuperAdminUser(userId)])
    : [null, false]

  const myTasks = userId && activeWorkspace
    ? await prisma.task.findMany({
        where: {
          AND: [
            taskAccessWhere(userId, "view", superAdmin),
            { workspace_id: activeWorkspace.id },
            { assignee_id: userId, status: { not: "complete" } },
          ],
        },
        include: { project: true, client: true },
        orderBy: { due_date: "asc" },
        take: 5,
      })
    : []

  const upcomingTasks = userId && activeWorkspace
    ? await prisma.task.count({
        where: {
          AND: [
            taskAccessWhere(userId, "view", superAdmin),
            { workspace_id: activeWorkspace.id },
            { assignee_id: userId, status: { not: "complete" } },
          ],
        },
      })
    : 0

  const projects = userId && activeWorkspace
    ? await prisma.project.findMany({
        where: {
          workspace_id: activeWorkspace.id,
          archived: false,
          ...projectAccessWhere(userId, "view", superAdmin),
        },
        include: { sections: { include: { _count: { select: { tasks: true } } } } },
        orderBy: { updated_at: "desc" },
        take: 6,
      })
    : []

  const overdueTasks = userId && activeWorkspace
    ? await prisma.task.count({
        where: {
          AND: [
            taskAccessWhere(userId, "view", superAdmin),
            { workspace_id: activeWorkspace.id },
            {
              assignee_id: userId,
              status: { not: "complete" },
              due_date: { lt: new Date() },
            },
          ],
        },
      })
    : 0

  const completedToday = userId && activeWorkspace
    ? await prisma.task.count({
        where: {
          AND: [
            taskAccessWhere(userId, "view", superAdmin),
            { workspace_id: activeWorkspace.id },
            {
              assignee_id: userId,
              completed_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
          ],
        },
      })
    : 0

  // Greeting based on time
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar bg-[#18181b]">
      <div className="max-w-5xl mx-auto py-8 px-6 space-y-8">
        {/* Hero Greeting */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#f4f4f5]">
            {greeting}, {userName} 👋
          </h1>
          <p className="text-xs text-[#a1a1aa] mt-1">Here&apos;s what&apos;s happening across your workspace.</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#202023] border border-[#3f3f46] rounded-xl p-4 flex items-center gap-3.5">
            <div className="p-2 bg-[#0075de]/15 border border-[#0075de]/30 rounded-lg">
              <Clock className="w-4 h-4 text-[#60a5fa]" />
            </div>
            <div>
              <p className="text-xl font-bold text-[#f4f4f5]">{upcomingTasks}</p>
              <p className="text-xs text-[#a1a1aa]">Tasks upcoming</p>
            </div>
          </div>
          <div className="bg-[#202023] border border-[#3f3f46] rounded-xl p-4 flex items-center gap-3.5">
            <div className="p-2 bg-rose-500/15 border border-rose-500/30 rounded-lg">
              <Flag className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-[#f4f4f5]">{overdueTasks}</p>
              <p className="text-xs text-[#a1a1aa]">Tasks overdue</p>
            </div>
          </div>
          <div className="bg-[#202023] border border-[#3f3f46] rounded-xl p-4 flex items-center gap-3.5">
            <div className="p-2 bg-emerald-500/15 border border-emerald-500/30 rounded-lg">
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-[#f4f4f5]">{completedToday}</p>
              <p className="text-xs text-[#a1a1aa]">Completed today</p>
            </div>
          </div>
        </div>

        {/* My Upcoming Tasks */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#a1a1aa]">My Upcoming Tasks</h2>
            <Link href="/my-tasks" className="text-xs font-semibold text-[#0075de] hover:underline">View all →</Link>
          </div>
          <div className="bg-[#202023] border border-[#3f3f46] rounded-xl divide-y divide-[#3f3f46] overflow-hidden">
            {myTasks.length === 0 ? (
              <div className="py-8 text-center text-[#71717a] text-xs">
                <CheckCircle className="w-6 h-6 mx-auto mb-2 text-emerald-400" />
                You&apos;re all caught up!
              </div>
            ) : (
              myTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 py-3 px-4 hover:bg-[#27272a] transition-colors">
                  <div className="w-2 h-2 rounded-full bg-[#0075de] shrink-0" />
                  <span className="flex-1 text-xs font-medium text-[#f4f4f5] truncate">{task.title}</span>
                  {task.due_date && <DueDateBadge dueDate={task.due_date} />}
                  {(task.project || task.client) && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#18181b] border border-[#3f3f46] text-[#a1a1aa] shrink-0 truncate max-w-[120px]">
                      {task.project?.name || task.client?.name}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Projects */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#a1a1aa]">Projects</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const taskCount = project.sections.reduce((sum, s) => sum + s._count.tasks, 0)
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}/${project.default_view}`}
                  className="bg-[#202023] border border-[#3f3f46] rounded-xl p-4 transition-all hover:border-[#0075de]/50 hover:shadow-md group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm"
                         style={{ backgroundColor: project.color || "#0075de" }}>
                      {project.icon === "palette" ? "🎨" : "📦"}
                    </div>
                    <h3 className="text-xs font-semibold text-[#f4f4f5] group-hover:text-[#60a5fa] transition-colors truncate">{project.name}</h3>
                  </div>
                  <p className="text-[11px] text-[#a1a1aa] line-clamp-2 mb-3 leading-relaxed">{project.description || "No description"}</p>
                  <div className="flex items-center gap-3 text-[10px] text-[#71717a] font-medium">
                    <span className="flex items-center gap-1">
                      <FolderOpen className="w-3 h-3 text-[#0075de]" />
                      {taskCount} tasks
                    </span>
                    <span>•</span>
                    <span>{project.sections.length} sections</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
