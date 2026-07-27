import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Link from "next/link"
import { format } from "date-fns"
import { Calendar, CheckCircle, Clock, Flag, FolderOpen, Zap } from "lucide-react"
import { getActiveWorkspaceForUser, projectAccessWhere, taskAccessWhere } from "@/lib/permissions"

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  const userName = session?.user?.name?.split(" ")[0] || "there"
  const activeWorkspace = userId ? await getActiveWorkspaceForUser(userId) : null

  const myTasks = userId && activeWorkspace
    ? await prisma.task.findMany({
        where: {
          AND: [
            taskAccessWhere(userId, "view"),
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
            taskAccessWhere(userId, "view"),
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
          ...projectAccessWhere(userId),
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
            taskAccessWhere(userId, "view"),
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
            taskAccessWhere(userId, "view"),
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
    <div className="h-full min-h-0 overflow-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto py-8 px-6">
        {/* Hero Greeting */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {greeting}, {userName} 👋
          </h1>
          <p className="text-gray-500 mt-2">Here&apos;s what&apos;s happening across your workspace.</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-xl p-5 flex items-center gap-4">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{upcomingTasks}</p>
              <p className="text-xs text-gray-500">Tasks upcoming</p>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-xl p-5 flex items-center gap-4">
            <div className="p-2.5 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <Flag className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{overdueTasks}</p>
              <p className="text-xs text-gray-500">Tasks overdue</p>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-xl p-5 flex items-center gap-4">
            <div className="p-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{completedToday}</p>
              <p className="text-xs text-gray-500">Completed today</p>
            </div>
          </div>
        </div>

        {/* My Upcoming Tasks */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">My Upcoming Tasks</h2>
            <Link href="/my-tasks" className="flex min-h-11 items-center text-sm font-medium text-blue-600 hover:text-blue-700">View all →</Link>
          </div>
          <div className="bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-xl divide-y dark:divide-zinc-800 overflow-hidden">
            {myTasks.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                You&apos;re all caught up!
              </div>
            ) : (
              myTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 py-3 px-4 hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{task.title}</span>
                  {task.due_date && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(task.due_date), "MMM d")}
                    </span>
                  )}
                  {(task.project || task.client) && (
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-gray-500 shrink-0 truncate max-w-[120px]">
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Projects</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const taskCount = project.sections.reduce((sum, s) => sum + s._count.tasks, 0)
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}/${project.default_view}`}
                  className="bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-xl p-5 hover:shadow-md transition-all hover:border-gray-300 dark:hover:border-zinc-700 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                         style={{ backgroundColor: project.color || "#6366f1" }}>
                      {project.icon === "palette" ? "🎨" : "📦"}
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 transition-colors truncate">{project.name}</h3>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3">{project.description || "No description"}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <FolderOpen className="w-3 h-3" />
                      {taskCount} tasks
                    </span>
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
