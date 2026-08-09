import Link from "next/link"
import type { ComponentType } from "react"
import { getServerSession } from "next-auth"
import { format } from "date-fns"
import {
  ArrowUpRight,
  AlertTriangle,
  BarChart3,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ChevronDown,
  Clock3,
  Download,
  Filter,
  FolderKanban,
  Gauge,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react"
import { authOptions } from "@/lib/auth"
import { getReportingData } from "@/lib/reporting-data"
import {
  REPORTING_PERIOD_OPTIONS,
  REPORTING_PRIORITY_OPTIONS,
  REPORTING_SCOPE_OPTIONS,
  REPORTING_STATUS_OPTIONS,
  reportingFiltersToSearchParams,
  reportingPeriodLabel,
  type ReportingAssigneeRow,
  type ReportingBreakdownRow,
  type ReportingChartSlice,
  type ReportingProjectRow,
  type ReportingRecommendation,
  type ReportingTrendPoint,
} from "@/lib/reporting-metrics"

type ReportingSearchParams = Promise<Record<string, string | string[] | undefined>>

function toneClasses(tone: "blue" | "green" | "amber" | "red" | "violet") {
  switch (tone) {
    case "green":
      return "border-emerald-500/15 bg-emerald-500/10 text-emerald-200"
    case "amber":
      return "border-amber-500/15 bg-amber-500/10 text-amber-200"
    case "red":
      return "border-red-500/15 bg-red-500/10 text-red-200"
    case "violet":
      return "border-violet-500/15 bg-violet-500/10 text-violet-200"
    default:
      return "border-blue-500/15 bg-blue-500/10 text-blue-200"
  }
}

function healthClasses(health: ReportingBreakdownRow["health"]) {
  if (health === "Healthy") return "bg-emerald-500/10 text-emerald-200"
  if (health === "Watch") return "bg-amber-500/10 text-amber-200"
  return "bg-red-500/10 text-red-200"
}

function recommendationToneClasses(tone: ReportingRecommendation["tone"]) {
  if (tone === "good") return "border-emerald-500/15 bg-emerald-500/10 text-emerald-200"
  if (tone === "warn") return "border-amber-500/15 bg-amber-500/10 text-amber-100"
  return "border-blue-500/15 bg-blue-500/10 text-blue-100"
}

function MetricCard({
  title,
  value,
  meta,
  icon: Icon,
  tone = "blue",
}: {
  title: string
  value: string
  meta: string
  icon: ComponentType<{ className?: string }>
  tone?: "blue" | "green" | "amber" | "red" | "violet"
}) {
  return (
    <div className="group relative min-h-36 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className={`rounded-xl border p-2.5 ${toneClasses(tone)}`}>
          <Icon className="h-4 w-4" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-white/15 transition-colors group-hover:text-white/40" />
      </div>
      <div className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">{title}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-3xl font-semibold tracking-[-0.04em] text-white/90">{value}</div>
        <div className="text-xs text-white/40">{meta}</div>
      </div>
    </div>
  )
}

function RiskSignal({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: "green" | "amber" | "red"
}) {
  const dotClass = tone === "green" ? "bg-emerald-400" : tone === "amber" ? "bg-amber-400" : "bg-red-400"

  return (
    <div className="flex items-center gap-3 px-5 py-4 sm:px-6">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</div>
        <div className="mt-1 truncate text-xs text-white/45">{detail}</div>
      </div>
      <div className="text-xl font-semibold tracking-[-0.03em] text-white/85">{value}</div>
    </div>
  )
}

function TrendChart({ points }: { points: ReportingTrendPoint[] }) {
  const width = 520
  const height = 190
  const padding = 24
  const maxValue = Math.max(...points.flatMap((point) => [point.completed, point.created]), 1)
  const step = (width - padding * 2) / Math.max(points.length - 1, 1)

  const lineFor = (key: "completed" | "created") => points.map((point, index) => {
    const x = padding + index * step
    const y = height - padding - (point[key] / maxValue) * (height - padding * 2)
    return { x, y }
  })

  const completedPoints = lineFor("completed")
  const createdPoints = lineFor("created")
  const pathFor = (items: Array<{ x: number; y: number }>) => items.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ")

  return (
    <div className="border-t border-white/5 pt-5">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" role="img" aria-labelledby="trend-chart-title trend-chart-description">
        <title id="trend-chart-title">Created and completed tasks over time</title>
        <desc id="trend-chart-description">A comparison of tasks created and completed in each reporting interval.</desc>
        {[0, 1, 2, 3].map((line) => {
          const y = padding + line * ((height - padding * 2) / 3)
          return <line key={line} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#34363d" strokeDasharray="4 8" />
        })}
        <path d={pathFor(createdPoints)} fill="none" stroke="#5b7dff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        <path d={pathFor(completedPoints)} fill="none" stroke="#35c8a4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {completedPoints.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r="4" fill="#35c8a4" stroke="#1f2022" strokeWidth="3" />
        ))}
      </svg>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-white/35">
        {points.map((point) => <span key={point.label}>{point.label}</span>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-white/45">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" />Completed</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-400" />Created</span>
      </div>
    </div>
  )
}

function DistributionBars({ title, data }: { title: string; data: ReportingChartSlice[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="rounded-2xl border border-white/5 bg-[#1f2022] p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white/85">{title}</h3>
        <span className="text-xs text-white/30">{total} tasks</span>
      </div>
      <div className="mt-5 space-y-4">
        {data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/25">No data in this report.</div>
        ) : (
          data.map((item) => {
            const percentage = total === 0 ? 0 : Math.round((item.value / total) * 100)
            return (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-white/60 capitalize">{item.label}</span>
                  <span className="font-semibold text-white/85">{item.value} ({percentage}%)</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: item.color }} />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/5">
      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${value}%` }} />
    </div>
  )
}

function ClientRow({ row }: { row: ReportingBreakdownRow }) {
  return (
    <Link href={`/clients?clientId=${row.id}`} className="grid gap-3 border-b border-white/5 px-1 py-4 transition-colors last:border-b-0 hover:bg-white/[0.025] md:grid-cols-[minmax(0,1.2fr)_90px_90px_90px_140px] md:items-center md:px-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color || "#5b7dff" }} />
          <span className="truncate text-sm font-semibold text-white/85">{row.name}</span>
        </div>
        <div className="mt-2 md:hidden"><ProgressBar value={row.completionRate} /></div>
      </div>
      <div className="text-xs text-white/45"><span className="font-semibold text-white/80">{row.openTasks}</span> open</div>
      <div className="text-xs text-white/45"><span className="font-semibold text-white/80">{row.overdueTasks}</span> overdue</div>
      <div className="text-xs text-white/45"><span className="font-semibold text-white/80">{row.completionRate}%</span> done</div>
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${healthClasses(row.health)}`}>{row.health}</span>
        <div className="hidden flex-1 md:block"><ProgressBar value={row.completionRate} /></div>
      </div>
    </Link>
  )
}

function ProjectRow({ row }: { row: ReportingProjectRow }) {
  const content = (
    <div className="grid gap-3 border-b border-white/5 px-1 py-4 transition-colors last:border-b-0 hover:bg-white/[0.025] md:grid-cols-[minmax(0,1.4fr)_minmax(110px,0.6fr)_90px_90px_130px] md:items-center md:px-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color || "#35c8a4" }} />
          <span className="truncate text-sm font-semibold text-white/85">{row.name}</span>
        </div>
        <div className="mt-1 truncate text-xs text-white/35">{row.clientName}</div>
      </div>
      <div className="text-xs text-white/45">{row.deadline ? `Due ${format(row.deadline, "MMM d")}` : "No deadline"}</div>
      <div className="text-xs text-white/45"><span className="font-semibold text-white/80">{row.openTasks}</span> open</div>
      <div className="text-xs text-white/45"><span className="font-semibold text-white/80">{row.overdueTasks}</span> overdue</div>
      <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${healthClasses(row.health)}`}>{row.health}</span>
    </div>
  )

  if (row.isDirectWork) return content
  return <Link href={`/projects/${row.id}/overview`}>{content}</Link>
}

function AssigneeRow({ row }: { row: ReportingAssigneeRow }) {
  return (
    <div className="border-b border-white/5 px-1 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white/85">{row.name}</div>
          <div className="mt-1 truncate text-xs text-white/35">{row.email || "No email"}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-200">Quality {row.qualityScore === null ? "N/A" : row.qualityScore}</div>
          <div className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${healthClasses(row.health)}`}>{row.completionRate}%</div>
        </div>
      </div>
      <div className="mt-3"><ProgressBar value={row.completionRate} /></div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/40">
        <span>{row.openTasks} open</span>
        <span>{row.overdueTasks} overdue</span>
        <span>{row.highPriorityOpen} high priority</span>
        <span>{row.firstPassAcceptance}% first pass</span>
        <span>{row.reworkTasks} quality rework</span>
      </div>
    </div>
  )
}

export default async function ReportingPage({ searchParams }: { searchParams: ReportingSearchParams }) {
  const params = await searchParams
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId) return null

  const data = await getReportingData(userId, params)
  if (!data) return null

  const summary = data.summary
  const quality = data.quality
  const exportHref = `/reporting/export?${reportingFiltersToSearchParams(data.filters).toString()}`
  const currentMonthCompleted = data.trend[data.trend.length - 1]?.completed || 0
  const previousMonthCompleted = data.trend[data.trend.length - 2]?.completed || 0

  return (
    <div className="h-full min-h-0 overflow-auto bg-[#1e1f21] custom-scrollbar">
      <div className="mx-auto max-w-[1440px] space-y-7 px-4 py-6 sm:px-6 sm:py-8 xl:px-10 xl:py-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold text-[#f06a6a]">KPI dashboard</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white/90 sm:text-4xl">Delivery pulse</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
              See what is moving, what is slipping, and where the team needs attention.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="border-r border-white/10 py-1 pr-4 text-right">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/25">Report window</div>
              <div className="mt-1 text-sm font-semibold text-white/85">{reportingPeriodLabel(data.filters)}</div>
            </div>
            <Link href={exportHref} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white">
              <Download className="h-4 w-4" />
              Export CSV
            </Link>
          </div>
        </div>

        <details className="group rounded-2xl border border-white/7 bg-[#242527]">
          <summary className="flex h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 sm:px-5 [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
              <Filter className="h-4 w-4 text-white/35" />
              Refine this view
            </div>
            <div className="flex items-center gap-2 text-xs text-white/35">
              <span>{reportingPeriodLabel(data.filters)}</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </div>
          </summary>
          <form action="/reporting" className="grid gap-3 border-t border-white/7 p-4 md:grid-cols-2 sm:p-5 xl:grid-cols-[1fr_1fr_1.25fr_1.25fr_1fr_1fr_auto]">
            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/30">
              Period
              <select name="period" defaultValue={data.filters.period} className="h-11 w-full rounded-xl border border-[#55565a] bg-[#1f2022] px-3 text-sm normal-case tracking-normal text-white/80 outline-none focus:border-[#f06a6a]/70">
                {REPORTING_PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/30">
              Scope
              {data.isManager ? (
                <select name="scope" defaultValue={data.filters.scope} className="h-11 w-full rounded-xl border border-[#55565a] bg-[#1f2022] px-3 text-sm normal-case tracking-normal text-white/80 outline-none focus:border-[#f06a6a]/70">
                  {REPORTING_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <>
                  <input type="hidden" name="scope" value="personal" />
                  <div className="flex h-11 items-center rounded-xl border border-white/10 bg-[#1f2022] px-3 text-sm normal-case tracking-normal text-white/45">Personal</div>
                </>
              )}
            </label>

            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/30">
              Start
              <input name="start" type="date" defaultValue={format(data.filters.start, "yyyy-MM-dd")} className="h-11 w-full rounded-xl border border-[#55565a] bg-[#1f2022] px-3 text-sm normal-case tracking-normal text-white/80 outline-none focus:border-[#f06a6a]/70" />
            </label>

            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/30">
              End
              <input name="end" type="date" defaultValue={format(data.filters.end, "yyyy-MM-dd")} className="h-11 w-full rounded-xl border border-[#55565a] bg-[#1f2022] px-3 text-sm normal-case tracking-normal text-white/80 outline-none focus:border-[#f06a6a]/70" />
            </label>

            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/30">
              Status
              <select name="status" defaultValue={data.filters.status} className="h-11 w-full rounded-xl border border-[#55565a] bg-[#1f2022] px-3 text-sm normal-case tracking-normal text-white/80 outline-none focus:border-[#f06a6a]/70">
                {REPORTING_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/30">
              Priority
              <select name="priority" defaultValue={data.filters.priority} className="h-11 w-full rounded-xl border border-[#55565a] bg-[#1f2022] px-3 text-sm normal-case tracking-normal text-white/80 outline-none focus:border-[#f06a6a]/70">
                {REPORTING_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <div className="flex items-end gap-2">
              <button type="submit" className="h-11 rounded-xl bg-[#f06a6a] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#e45f5f]">Apply</button>
              <Link href="/reporting" className="flex h-11 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-white/55 transition-colors hover:bg-white/5 hover:text-white/80">Reset</Link>
            </div>

            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/30 xl:col-span-3">
              Client
              <select name="clientId" defaultValue={data.filters.clientId || "all"} className="h-11 w-full rounded-xl border border-[#55565a] bg-[#1f2022] px-3 text-sm normal-case tracking-normal text-white/80 outline-none focus:border-[#f06a6a]/70">
                <option value="all">All clients</option>
                {data.filterOptions.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>

            <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/30 xl:col-span-4">
              Project
              <select name="projectId" defaultValue={data.filters.projectId || "all"} className="h-11 w-full rounded-xl border border-[#55565a] bg-[#1f2022] px-3 text-sm normal-case tracking-normal text-white/80 outline-none focus:border-[#f06a6a]/70">
                <option value="all">All projects</option>
                {data.filterOptions.projects.map((project) => <option key={project.id} value={project.id}>{project.clientName ? `${project.clientName} / ${project.name}` : project.name}</option>)}
              </select>
            </label>
          </form>
        </details>

        <section className="overflow-hidden rounded-[28px] border border-white/7 bg-[#242527]">
          <div className="grid xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,2fr)]">
            <div className="flex min-h-64 flex-col justify-between border-b border-white/7 bg-[#292825] p-6 sm:p-8 xl:border-b-0 xl:border-r">
              <div className="flex items-center justify-between gap-4">
                <div className="text-[11px] font-semibold text-[#ffaaaa]">Delivery reliability</div>
                <Gauge className="h-5 w-5 text-[#f06a6a]" />
              </div>
              <div>
                <div className="text-5xl font-semibold tracking-[-0.06em] text-white/95 sm:text-6xl">{summary.deliveryReliability}<span className="ml-1 text-xl text-white/30">%</span></div>
                <p className="mt-3 max-w-xs text-sm leading-6 text-white/45">
                  A blended signal across completion, timing, goals, and delivery risk.
                </p>
              </div>
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-[11px] text-white/35">
                  <span>{summary.totalTasks} tasks in scope</span>
                  <span>{summary.goalProgressAverage}% goal progress</span>
                </div>
                <ProgressBar value={summary.deliveryReliability} />
              </div>
            </div>

            <div className="grid divide-y divide-white/7 sm:grid-cols-2 sm:divide-x xl:grid-cols-4 xl:divide-y-0">
              <MetricCard title="Completion" value={`${summary.completionRate}%`} meta={`${summary.completedTasks} done`} icon={CheckCircle2} tone="green" />
              <MetricCard title="On time" value={`${summary.onTimeRate}%`} meta="by due date" icon={Clock3} tone={summary.onTimeRate >= 80 ? "green" : "amber"} />
              <MetricCard title="Active work" value={String(summary.activeProjects)} meta="projects" icon={FolderKanban} tone="violet" />
              <MetricCard title="Focus" value={`${summary.focusHours}h`} meta={`${summary.focusRate}% capacity`} icon={CalendarDays} tone="blue" />
            </div>
          </div>

          <div className="grid border-t border-white/7 divide-y divide-white/7 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <RiskSignal label="Overdue" value={String(summary.overdueTasks)} detail={`${summary.dueSoonTasks} due before window close`} tone={summary.overdueTasks > 0 ? "red" : "green"} />
            <RiskSignal label="Urgent work" value={String(summary.highPriorityOpen)} detail="High-priority tasks still open" tone={summary.highPriorityOpen > 0 ? "amber" : "green"} />
            <RiskSignal label="Projects at risk" value={String(summary.atRiskProjects)} detail="Workstreams needing intervention" tone={summary.atRiskProjects > 0 ? "red" : "green"} />
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-white/7 bg-[#242527]">
          <div className="grid xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,2fr)]">
            <div className="flex min-h-64 flex-col justify-between border-b border-white/7 bg-[#252824] p-6 sm:p-8 xl:border-b-0 xl:border-r">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/60">Monthly quality control</div>
                  <div className="mt-1 text-xs text-white/35">{quality.monthLabel}</div>
                </div>
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <div className="text-5xl font-semibold tracking-[-0.06em] text-white/95 sm:text-6xl">
                  {quality.score === null ? "N/A" : quality.score}
                  {quality.score !== null ? <span className="ml-1 text-xl text-white/30">/100</span> : null}
                </div>
                <p className="mt-3 max-w-xs text-sm leading-6 text-white/45">
                  Based on the first fixed grade, with a 10-point penalty for each additional scored rework cycle.
                </p>
              </div>
              <div className="mt-6 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-white/35">
                  <span>{quality.reviewedTasks} reviewed</span>
                  <span>{quality.previousMonthChange === null ? "No prior comparison" : `${quality.previousMonthChange >= 0 ? "+" : ""}${quality.previousMonthChange} vs previous month`}</span>
                </div>
                <ProgressBar value={quality.score || 0} />
                {quality.reviewedTasks > 0 && quality.reviewedTasks < 3 ? <div className="text-[11px] text-amber-200/70">Low sample size. Read this score with the task count.</div> : null}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="grid flex-1 divide-y divide-white/7 sm:grid-cols-2 sm:divide-x xl:grid-cols-4 xl:divide-y-0">
                <MetricCard title="First-pass" value={`${quality.firstPassAcceptance}%`} meta="accepted first time" icon={CheckCircle2} tone={quality.firstPassAcceptance >= 80 ? "green" : "amber"} />
                <MetricCard title="Reviewed tasks" value={String(quality.reviewedTasks)} meta={`${quality.pendingTasks} pending`} icon={ClipboardCheck} tone="blue" />
                <MetricCard title="Rework cycles" value={String(quality.totalReworkCycles)} meta={`${quality.reworkTasks} tasks`} icon={RotateCcw} tone={quality.totalReworkCycles > 0 ? "amber" : "green"} />
                <MetricCard title="Blockers" value={String(quality.blockers)} meta="scored findings" icon={AlertTriangle} tone={quality.blockers > 0 ? "red" : "green"} />
              </div>
              <div className="grid grid-cols-2 border-t border-white/7 text-xs sm:grid-cols-4">
                <div className="px-5 py-3 text-white/40"><span className="font-semibold text-emerald-300">{quality.gradeDistribution.excellent}</span> Excellent</div>
                <div className="px-5 py-3 text-white/40"><span className="font-semibold text-blue-300">{quality.gradeDistribution.good}</span> Good</div>
                <div className="px-5 py-3 text-white/40"><span className="font-semibold text-amber-300">{quality.gradeDistribution.needsRework}</span> Needs rework</div>
                <div className="px-5 py-3 text-white/40"><span className="font-semibold text-rose-300">{quality.gradeDistribution.majorRework}</span> Major rework</div>
              </div>
              {quality.isProvisional ? (
                <div className="flex items-center gap-2 border-t border-amber-500/15 bg-amber-500/10 px-5 py-3 text-xs text-amber-100 sm:px-6">
                  <Clock3 className="h-4 w-4 shrink-0" />
                  Provisional: some tasks are still awaiting a decision or moving through rework, so this month can still change.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
          <div className="rounded-[28px] border border-white/7 bg-[#242527] p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-300/55">Momentum</div>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-white/90 sm:text-2xl">Created vs completed</h2>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/55">
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-300" />
                {currentMonthCompleted - previousMonthCompleted} completed vs last month
              </div>
            </div>
            <div className="mt-7">
              <TrendChart points={data.trend} />
            </div>
          </div>

          <div className="space-y-5">
            <DistributionBars title="Tasks by status" data={data.statusDistribution} />
            <DistributionBars title="Tasks by priority" data={data.priorityDistribution} />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl border border-white/5 bg-[#262729] p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/25">Client health</div>
                <h2 className="mt-3 text-2xl font-semibold text-white/90">Delivery risk by client</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/45">{data.clientRows.length} clients</div>
            </div>
            <div className="mt-5 space-y-3">
              {data.clientRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/30">No client work matches this report.</div>
              ) : (
                data.clientRows.slice(0, 8).map((row) => <ClientRow key={row.id} row={row} />)
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/5 bg-[#262729] p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/25">Action center</div>
                <h2 className="mt-3 text-2xl font-semibold text-white/90">What helps now</h2>
              </div>
              <TrendingUp className="h-5 w-5 text-blue-300" />
            </div>
            <div className="mt-5 space-y-3">
              {data.recommendations.map((item) => (
                <Link key={item.title} href={item.href} className={`block rounded-2xl border px-4 py-4 transition-colors hover:bg-white/5 ${recommendationToneClasses(item.tone)}`}>
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className="mt-1 text-sm opacity-80">{item.detail}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <div className="rounded-3xl border border-white/5 bg-[#262729] p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/25">Project report</div>
                <h2 className="mt-3 text-2xl font-semibold text-white/90">Project breakdown</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/45">{data.projectRows.length} workstreams</div>
            </div>
            <div className="mt-5 space-y-3">
              {data.projectRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/30">No project work matches this report.</div>
              ) : (
                data.projectRows.slice(0, 10).map((row) => <ProjectRow key={row.id} row={row} />)
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-white/5 bg-[#262729] p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/25">Workload</div>
                  <h2 className="mt-3 text-2xl font-semibold text-white/90">By assignee</h2>
                </div>
                <Users className="h-5 w-5 text-white/35" />
              </div>
              <div className="mt-5 space-y-3">
                {data.assigneeRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/30">No assignees in this report.</div>
                ) : (
                  data.assigneeRows.slice(0, 5).map((row) => <AssigneeRow key={row.id} row={row} />)
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-[#262729] p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/25">Bottlenecks</div>
                  <h2 className="mt-3 text-2xl font-semibold text-white/90">Open work pools</h2>
                </div>
                <BarChart3 className="h-5 w-5 text-white/35" />
              </div>
              <div className="mt-5 space-y-4">
                {data.bottleneckRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/30">No bottlenecks found.</div>
                ) : (
                  data.bottleneckRows.map((row) => (
                    <div key={row.name} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="capitalize text-white/60">{row.name}</span>
                        <span className="font-semibold text-white/85">{row.value} tasks</span>
                      </div>
                      <ProgressBar value={row.percentage} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-3xl border border-white/5 bg-[#262729] p-6 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/25">Context</div>
            <h2 className="mt-3 text-2xl font-semibold text-white/90">Report scope</h2>
            <div className="mt-5 space-y-3 text-sm text-white/50">
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#1f2022] px-4 py-3"><span>Workspace</span><span className="font-semibold text-white/80">{data.workspace?.name || "No workspace"}</span></div>
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#1f2022] px-4 py-3"><span>Role</span><span className="font-semibold capitalize text-white/80">{data.isManager ? "manager" : data.workspaceRole}</span></div>
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#1f2022] px-4 py-3"><span>View</span><span className="font-semibold capitalize text-white/80">{data.filters.scope}</span></div>
              {data.pendingRequests > 0 ? <Link href="/admin/members" className="block rounded-2xl border border-violet-500/15 bg-violet-500/10 px-4 py-3 text-sm font-semibold text-violet-200">{data.pendingRequests} pending access requests</Link> : null}
            </div>
          </div>

          <div className="rounded-3xl border border-white/5 bg-[#262729] p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/25">Schedule</div>
                <h2 className="mt-3 text-2xl font-semibold text-white/90">Upcoming deadlines</h2>
              </div>
              <Briefcase className="h-5 w-5 text-white/35" />
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {data.upcomingTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/30 lg:col-span-2">No upcoming deadlines in this report window.</div>
              ) : (
                data.upcomingTasks.map((task) => {
                  const href = task.project ? `/projects/${task.project.id}/list?taskId=${task.id}` : task.client ? `/clients?clientId=${task.client.id}&taskId=${task.id}` : `/my-tasks?taskId=${task.id}`
                  return (
                    <Link key={task.id} href={href} className="rounded-2xl border border-white/5 bg-[#1f2022] px-4 py-3 transition-colors hover:bg-white/5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white/85">{task.title}</div>
                          <div className="mt-1 truncate text-xs text-white/35">{task.project?.name || task.client?.name || "Personal task"}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/60">{task.due_date ? format(task.due_date, "MMM d") : "No date"}</span>
                      </div>
                    </Link>
                  )
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
