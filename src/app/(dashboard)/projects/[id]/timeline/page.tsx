import Link from "next/link"
import { getServerSession } from "next-auth"
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  max,
  min,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns"
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isSuperAdminUser, projectAccessWhere } from "@/lib/permissions"
import ProjectViewTabs from "@/components/project-view-tabs"
import ShareButton from "@/components/share-button"

function parseMonthParam(value?: string) {
  if (!value) return startOfMonth(new Date())

  const parsed = parseISO(value)
  return Number.isNaN(parsed.getTime()) ? startOfMonth(new Date()) : startOfMonth(parsed)
}

export default async function ProjectTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const { id } = await params
  const { month } = await searchParams
  const currentMonth = parseMonthParam(month)
  const rangeStart = startOfMonth(currentMonth)
  const rangeEnd = endOfMonth(currentMonth)
  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1

  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return <div>Project not found</div>

  const isSuperAdmin = await isSuperAdminUser(userId)
  const project = await prisma.project.findFirst({
    where: { id, ...projectAccessWhere(userId, "view", isSuperAdmin) },
    include: { tasks: { orderBy: [{ start_date: "asc" }, { due_date: "asc" }, { created_at: "asc" }] } },
  })

  if (!project) return <div>Project not found</div>

  const scheduledTasks = project.tasks
    .map((task) => {
      const rawStart = task.start_date || task.due_date || task.created_at
      const rawEnd = task.due_date || task.start_date || task.created_at

      if (!rawStart || !rawEnd) return null

      const taskStart = rawStart < rawEnd ? rawStart : rawEnd
      const taskEnd = rawEnd > rawStart ? rawEnd : rawStart

      if (taskEnd < rangeStart || taskStart > rangeEnd) return null

      const clampedStart = max([taskStart, rangeStart])
      const clampedEnd = min([taskEnd, rangeEnd])
      const offsetDays = differenceInCalendarDays(clampedStart, rangeStart)
      const spanDays = differenceInCalendarDays(clampedEnd, clampedStart) + 1

      return {
        ...task,
        clampedStart,
        clampedEnd,
        offsetDays,
        spanDays,
      }
    })
    .filter((task): task is NonNullable<typeof task> => Boolean(task))

  const previousMonth = format(startOfMonth(subMonths(currentMonth, 1)), "yyyy-MM-dd")
  const nextMonth = format(startOfMonth(addMonths(currentMonth, 1)), "yyyy-MM-dd")

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#1e1f21] overflow-hidden">
      <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-5 sm:items-center sm:px-8 sm:pt-8">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-white/90 sm:text-3xl">{project.name} Timeline</h1>
          <p className="text-sm text-white/40 mt-1">Date-driven timeline based on task start and due dates.</p>
        </div>
        <ShareButton className="h-11 shrink-0 rounded-md border border-white/10 px-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 sm:h-9" />
      </div>

      <div className="shrink-0 px-4 pt-4 sm:px-8 sm:pt-6">
        <ProjectViewTabs projectId={project.id} clientId={project.client_id} />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <Link href={`?month=${previousMonth}`} className="flex h-11 w-11 items-center justify-center rounded-md text-white/50 hover:bg-white/5 sm:h-9 sm:w-9" aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <Link href={`?month=${nextMonth}`} className="flex h-11 w-11 items-center justify-center rounded-md text-white/50 hover:bg-white/5 sm:h-9 sm:w-9" aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Link>
          <span className="text-lg font-semibold text-white/85 ml-2">{format(currentMonth, "MMMM yyyy")}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/40 bg-white/5 rounded-md border border-white/5 px-3 py-1.5">
          <CalendarRange className="w-3.5 h-3.5 text-blue-400" />
          {scheduledTasks.length} scheduled tasks
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-10 custom-scrollbar sm:px-8">
        <div className="min-w-[960px] py-8 space-y-8">
          <div className="grid gap-2" style={{ gridTemplateColumns: `280px repeat(${totalDays}, minmax(28px, 1fr))` }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/25 py-2">Task</div>
            {Array.from({ length: totalDays }).map((_, index) => (
              <div key={index} className="text-[10px] text-center text-white/25 py-2 border-l border-white/5">
                {index + 1}
              </div>
            ))}
          </div>

          {scheduledTasks.length === 0 ? (
            <div className="py-20 text-center text-white/30 border border-dashed border-white/10 rounded-2xl">
              Add start dates or due dates to project tasks to see them on the timeline.
            </div>
          ) : (
            <div className="space-y-3">
              {scheduledTasks.map((task) => {
                return (
                  <div key={task.id} className="grid items-center gap-2" style={{ gridTemplateColumns: `280px repeat(${totalDays}, minmax(28px, 1fr))` }}>
                    <Link href={`/projects/${project.id}/list?taskId=${task.id}`} className="pr-4 min-w-0">
                      <div className="text-sm font-medium text-white/85 truncate">{task.title}</div>
                      <div className="text-[11px] text-white/35 mt-1">
                        {format(task.clampedStart, "MMM d")} - {format(task.clampedEnd, "MMM d")}
                      </div>
                    </Link>

                    {Array.from({ length: totalDays }).map((_, index) => {
                      const inRange = index >= task.offsetDays && index < task.offsetDays + task.spanDays
                      const isStart = index === task.offsetDays
                      const isEnd = index === task.offsetDays + task.spanDays - 1

                      return (
                        <div key={index} className="h-9 flex items-center border-l border-white/5">
                          {inRange ? (
                            <Link
                              href={`/projects/${project.id}/list?taskId=${task.id}`}
                              className={`h-7 w-full ${isStart ? "rounded-l-full" : ""} ${isEnd ? "rounded-r-full" : ""} ${task.priority === "high" ? "bg-red-500/30 border border-red-500/30" : task.priority === "medium" ? "bg-amber-500/25 border border-amber-500/30" : "bg-blue-500/25 border border-blue-500/30"}`}
                              aria-label={`Open ${task.title}`}
                            />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
