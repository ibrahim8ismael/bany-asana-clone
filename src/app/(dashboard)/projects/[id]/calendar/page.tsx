import Link from "next/link"
import { getServerSession } from "next-auth"
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import ProjectViewTabs from "@/components/project-view-tabs"
import { isSuperAdminUser, projectAccessWhere } from "@/lib/permissions"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"
import ShareButton from "@/components/share-button"

function parseMonthParam(value?: string) {
  if (!value) return startOfMonth(new Date())

  const parsed = parseISO(value)
  return Number.isNaN(parsed.getTime()) ? startOfMonth(new Date()) : startOfMonth(parsed)
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const { id } = await params
  const { month } = await searchParams
  const currentMonth = parseMonthParam(month)

  const session = await getServerSession(authOptions)
  if (!session) return null
  const userId = (session.user as { id?: string } | undefined)?.id
  if (!userId) return notFound()

  const isSuperAdmin = await isSuperAdminUser(userId)
  const project = await prisma.project.findFirst({
    where: id !== "demo"
      ? { id, ...projectAccessWhere(userId, "view", isSuperAdmin) }
      : { ...projectAccessWhere(userId, "view", isSuperAdmin) },
    include: {
      tasks: {
        where: { archived: false, due_date: { not: null } },
        include: { assignee: { select: USER_PUBLIC_SELECT } },
        orderBy: { due_date: "asc" },
      },
    },
  })

  if (!project) return notFound()

  const gridStart = startOfWeek(currentMonth, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 })

  const days: Date[] = []
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    days.push(day)
  }

  const previousMonth = format(startOfMonth(subMonths(currentMonth, 1)), "yyyy-MM-dd")
  const nextMonth = format(startOfMonth(addMonths(currentMonth, 1)), "yyyy-MM-dd")

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-zinc-950 overflow-hidden">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-4 sm:items-center sm:px-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{project.name}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Monthly due dates view for scheduled project work.</p>
        </div>
        <ShareButton className="h-11 shrink-0 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800 sm:h-9" />
      </div>
      <ProjectViewTabs projectId={project.id} clientId={project.client_id} />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-4 dark:border-zinc-800 sm:px-6">
        <div className="flex items-center gap-2">
          <Link href={`?month=${previousMonth}`} className="flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-900 sm:h-9 sm:w-9" aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <Link href={`?month=${nextMonth}`} className="flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-900 sm:h-9 sm:w-9" aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Link>
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100 ml-2">
            {format(currentMonth, "MMMM yyyy")}
          </span>
        </div>
        <Link href={`?month=${format(startOfMonth(new Date()), "yyyy-MM-dd")}`} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
          Today
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 custom-scrollbar sm:p-6">
        <div className="grid min-h-[720px] min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 dark:border-zinc-800 dark:bg-zinc-800">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
            <div key={label} className="bg-gray-50 dark:bg-zinc-900 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
              {label}
            </div>
          ))}

          {days.map((day) => {
            const items = project.tasks.filter((task) => task.due_date && isSameDay(new Date(task.due_date), day))

            return (
              <div
                key={day.toISOString()}
                className={`bg-white dark:bg-zinc-950 p-2 min-h-[128px] transition-colors ${isToday(day) ? "ring-1 ring-blue-500/40 ring-inset" : "hover:bg-gray-50/60 dark:hover:bg-zinc-900/60"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-medium ${isSameMonth(day, currentMonth) ? "text-gray-700 dark:text-zinc-200" : "text-gray-300 dark:text-zinc-600"}`}>
                    {format(day, "d")}
                  </span>
                  {items.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                      {items.length}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {items.slice(0, 4).map((task) => (
                    <Link
                      key={task.id}
                      href={`/projects/${project.id}/list?taskId=${task.id}`}
                      className="block text-xs rounded-md px-2 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:opacity-90 border border-blue-100 dark:border-blue-900/30"
                    >
                      <div className="truncate font-medium">{task.title}</div>
                      {task.assignee && (
                        <div className="truncate text-[10px] text-blue-500 dark:text-blue-200/80 mt-0.5">
                          {task.assignee.full_name}
                        </div>
                      )}
                    </Link>
                  ))}

                  {items.length > 4 && (
                    <Link href={`/projects/${project.id}/list`} className="block text-[11px] text-gray-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-300">
                      + {items.length - 4} more tasks
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
