import {
  addMonths,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  subMonths,
} from "date-fns"
import { TASK_WORKFLOW_STAGES } from "@/lib/workflow"

export const REPORTING_PERIOD_OPTIONS = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "custom", label: "Custom" },
] as const

export const REPORTING_SCOPE_OPTIONS = [
  { value: "personal", label: "Personal" },
  { value: "team", label: "Team" },
] as const

export const REPORTING_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...TASK_WORKFLOW_STAGES.map((stage) => ({ value: stage.id, label: stage.label })),
] as const

export const REPORTING_PRIORITY_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "No priority" },
] as const

export type ReportingPeriod = (typeof REPORTING_PERIOD_OPTIONS)[number]["value"]
export type ReportingScope = (typeof REPORTING_SCOPE_OPTIONS)[number]["value"]
export type ReportingStatus = (typeof REPORTING_STATUS_OPTIONS)[number]["value"]
export type ReportingPriority = (typeof REPORTING_PRIORITY_OPTIONS)[number]["value"]

export type ReportingParamsLike = Record<string, string | string[] | undefined> | URLSearchParams

export interface ReportingFilters {
  period: ReportingPeriod
  scope: ReportingScope
  start: Date
  end: Date
  clientId: string | null
  projectId: string | null
  status: ReportingStatus
  priority: ReportingPriority
}

export interface ReportingGoalInput {
  id: string
  name: string
  status: string
  target_value: number | null
  current_value: number | null
  due_date: Date | null
}

export interface ReportingTimeEntryInput {
  minutes: number
  date: Date
}

export interface ReportingTeamMemberInput {
  role: string
  user: {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
  }
}

export interface ReportingTaskInput {
  id: string
  title: string
  status: string
  priority: string | null
  due_date: Date | null
  completed_at: Date | null
  created_at: Date
  updated_at: Date
  assignee_id: string | null
  quality_required?: boolean
  quality_state?: string
  first_submitted_at?: Date | null
  quality_score?: number | null
  first_quality_grade?: string | null
  final_quality_grade?: string | null
  review_cycle_count?: number
  rework_count?: number
  quality_blocker_count?: number
  assignee: {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
  } | null
  project: {
    id: string
    name: string
    color: string | null
    status: string
    deadline: Date | null
    client_id: string | null
    client: {
      id: string
      name: string
      color: string | null
    } | null
  } | null
  client: {
    id: string
    name: string
    color: string | null
  } | null
  section: {
    id: string
    name: string
  } | null
}

export interface ReportingBreakdownRow {
  id: string
  name: string
  color: string | null
  totalTasks: number
  completedTasks: number
  openTasks: number
  overdueTasks: number
  highPriorityOpen: number
  completionRate: number
  health: "Healthy" | "Watch" | "At risk"
}

export interface ReportingProjectRow extends ReportingBreakdownRow {
  clientName: string
  deadline: Date | null
  status: string
  isDirectWork: boolean
}

export interface ReportingAssigneeRow extends ReportingBreakdownRow {
  email: string | null
  avatarUrl: string | null
  qualityScore: number | null
  qualityTasks: number
  firstPassAcceptance: number
  reworkTasks: number
}

export interface ReportingChartSlice {
  label: string
  value: number
  color: string
}

export interface ReportingTrendPoint {
  label: string
  completed: number
  created: number
}

export interface ReportingQualitySummary {
  monthLabel: string
  score: number | null
  previousMonthScore: number | null
  previousMonthChange: number | null
  reviewedTasks: number
  pendingTasks: number
  firstPassAcceptance: number
  reworkTasks: number
  totalReworkCycles: number
  blockers: number
  isProvisional: boolean
  gradeDistribution: {
    excellent: number
    good: number
    needsRework: number
    majorRework: number
  }
}

export interface ReportingRecommendation {
  title: string
  detail: string
  href: string
  tone: "good" | "warn" | "info"
}

export interface ReportingMetrics {
  tasks: ReportingTaskInput[]
  summary: {
    totalTasks: number
    completedTasks: number
    openTasks: number
    completionRate: number
    overdueTasks: number
    dueSoonTasks: number
    highPriorityOpen: number
    onTimeRate: number
    activeProjects: number
    atRiskProjects: number
    focusHours: number
    focusRate: number
    deliveryReliability: number
    goalProgressAverage: number
  }
  trend: ReportingTrendPoint[]
  quality: ReportingQualitySummary
  statusDistribution: ReportingChartSlice[]
  priorityDistribution: ReportingChartSlice[]
  clientRows: ReportingBreakdownRow[]
  projectRows: ReportingProjectRow[]
  assigneeRows: ReportingAssigneeRow[]
  bottleneckRows: Array<{ name: string; value: number; percentage: number }>
  recommendations: ReportingRecommendation[]
  upcomingTasks: ReportingTaskInput[]
}

const chartColors = ["#5b7dff", "#35c8a4", "#f4b64d", "#ff6b6b", "#9f66ff", "#60a5fa"]

function firstParam(params: ReportingParamsLike, key: string) {
  if (params instanceof URLSearchParams) return params.get(key) || undefined

  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

function isOneOf<T extends string>(value: string | undefined, values: readonly T[]): value is T {
  return Boolean(value && values.includes(value as T))
}

function parseDateParam(value: string | undefined) {
  if (!value) return null

  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function calculatePercent(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function calculateGoalProgress(goal: ReportingGoalInput) {
  if (goal.target_value && goal.current_value !== null) {
    return clamp(Math.round((goal.current_value / goal.target_value) * 100), 0, 100)
  }

  switch (goal.status) {
    case "achieved":
      return 100
    case "on_track":
      return 76
    case "at_risk":
      return 49
    case "off_track":
      return 18
    default:
      return 0
  }
}

export function resolveReportingFilters(params: ReportingParamsLike = {}, now = new Date()): ReportingFilters {
  const periodParam = firstParam(params, "period")
  const scopeParam = firstParam(params, "scope")
  const statusParam = firstParam(params, "status")
  const priorityParam = firstParam(params, "priority")

  const period = isOneOf(periodParam, REPORTING_PERIOD_OPTIONS.map((option) => option.value)) ? periodParam : "month"
  const scope = isOneOf(scopeParam, REPORTING_SCOPE_OPTIONS.map((option) => option.value)) ? scopeParam : "personal"
  const status = isOneOf(statusParam, REPORTING_STATUS_OPTIONS.map((option) => option.value)) ? statusParam : "all"
  const priority = isOneOf(priorityParam, REPORTING_PRIORITY_OPTIONS.map((option) => option.value)) ? priorityParam : "all"

  let start: Date
  let end: Date

  if (period === "week") {
    start = startOfWeek(now)
    end = endOfWeek(now)
  } else if (period === "quarter") {
    start = startOfQuarter(now)
    end = endOfQuarter(now)
  } else if (period === "custom") {
    start = startOfDay(parseDateParam(firstParam(params, "start")) || startOfMonth(now))
    end = endOfDay(parseDateParam(firstParam(params, "end")) || now)

    if (start > end) {
      end = endOfDay(start)
    }
  } else {
    start = startOfMonth(now)
    end = endOfMonth(now)
  }

  return {
    period,
    scope,
    start,
    end,
    clientId: cleanFilterId(firstParam(params, "clientId")),
    projectId: cleanFilterId(firstParam(params, "projectId")),
    status,
    priority,
  }
}

function cleanFilterId(value: string | undefined) {
  if (!value || value === "all") return null
  return value
}

export function reportingFiltersToSearchParams(filters: ReportingFilters, overrides: Partial<Omit<ReportingFilters, "start" | "end"> & { start: Date | string; end: Date | string }> = {}) {
  const period = overrides.period || filters.period
  const scope = overrides.scope || filters.scope
  const status = overrides.status || filters.status
  const priority = overrides.priority || filters.priority
  const clientId = overrides.clientId === undefined ? filters.clientId : overrides.clientId
  const projectId = overrides.projectId === undefined ? filters.projectId : overrides.projectId
  const start = overrides.start || filters.start
  const end = overrides.end || filters.end
  const params = new URLSearchParams()

  params.set("period", period)
  params.set("scope", scope)

  if (period === "custom") {
    params.set("start", typeof start === "string" ? start : format(start, "yyyy-MM-dd"))
    params.set("end", typeof end === "string" ? end : format(end, "yyyy-MM-dd"))
  }

  if (clientId) params.set("clientId", clientId)
  if (projectId) params.set("projectId", projectId)
  if (status !== "all") params.set("status", status)
  if (priority !== "all") params.set("priority", priority)

  return params
}

export function reportingPeriodLabel(filters: Pick<ReportingFilters, "start" | "end">) {
  const sameYear = filters.start.getFullYear() === filters.end.getFullYear()
  return `${format(filters.start, sameYear ? "MMM d" : "MMM d, yyyy")} - ${format(filters.end, "MMM d, yyyy")}`
}

function isComplete(task: Pick<ReportingTaskInput, "status">) {
  return task.status === "complete"
}

function isBetween(date: Date | null | undefined, start: Date, end: Date) {
  return Boolean(date && date >= start && date <= end)
}

function taskTouchesWindow(task: ReportingTaskInput, filters: ReportingFilters) {
  if (isBetween(task.created_at, filters.start, filters.end)) return true
  if (isBetween(task.due_date, filters.start, filters.end)) return true
  if (isBetween(task.completed_at, filters.start, filters.end)) return true

  return !isComplete(task) && task.created_at <= filters.end
}

function healthFor(completionRate: number, overdueTasks: number, highPriorityOpen: number) {
  if (overdueTasks > 0 || completionRate < 50) return "At risk" as const
  if (highPriorityOpen > 0 || completionRate < 75) return "Watch" as const
  return "Healthy" as const
}

function createBreakdownRow(id: string, name: string, color: string | null): ReportingBreakdownRow {
  return {
    id,
    name,
    color,
    totalTasks: 0,
    completedTasks: 0,
    openTasks: 0,
    overdueTasks: 0,
    highPriorityOpen: 0,
    completionRate: 0,
    health: "Healthy",
  }
}

function qualityTasksInWindow(tasks: ReportingTaskInput[], start: Date, end: Date) {
  return tasks.filter((task) => isBetween(task.first_submitted_at, start, end))
}

export function buildQualitySummary(tasks: ReportingTaskInput[], start: Date, end: Date): Omit<ReportingQualitySummary, "monthLabel" | "previousMonthScore" | "previousMonthChange"> {
  const submittedTasks = qualityTasksInWindow(tasks, start, end)
  const reviewedTasks = submittedTasks.filter((task) => task.quality_score !== null && task.quality_score !== undefined)
  const pendingTasks = submittedTasks.filter((task) => task.quality_score === null || task.quality_score === undefined)
  const score = reviewedTasks.length > 0
    ? Math.round(reviewedTasks.reduce((sum, task) => sum + (task.quality_score || 0), 0) / reviewedTasks.length)
    : null

  return {
    score,
    reviewedTasks: reviewedTasks.length,
    pendingTasks: pendingTasks.length,
    firstPassAcceptance: calculatePercent(reviewedTasks.filter((task) => (task.rework_count || 0) === 0).length, reviewedTasks.length),
    reworkTasks: submittedTasks.filter((task) => (task.rework_count || 0) > 0).length,
    totalReworkCycles: submittedTasks.reduce((sum, task) => sum + (task.rework_count || 0), 0),
    blockers: submittedTasks.reduce((sum, task) => sum + (task.quality_blocker_count || 0), 0),
    isProvisional: pendingTasks.length > 0 || submittedTasks.some((task) => task.quality_state === "submitted" || task.quality_state === "needs_rework"),
    gradeDistribution: {
      excellent: submittedTasks.filter((task) => task.first_quality_grade === "excellent").length,
      good: submittedTasks.filter((task) => task.first_quality_grade === "good").length,
      needsRework: submittedTasks.filter((task) => task.first_quality_grade === "needs_rework").length,
      majorRework: submittedTasks.filter((task) => task.first_quality_grade === "major_rework").length,
    },
  }
}

function addTaskToBreakdown(row: ReportingBreakdownRow, task: ReportingTaskInput, now: Date) {
  row.totalTasks += 1
  if (isComplete(task)) {
    row.completedTasks += 1
  } else {
    row.openTasks += 1
    if (task.due_date && task.due_date < now) row.overdueTasks += 1
    if (task.priority === "high") row.highPriorityOpen += 1
  }
}

function finalizeBreakdownRow<T extends ReportingBreakdownRow>(row: T): T {
  row.completionRate = calculatePercent(row.completedTasks, row.totalTasks)
  row.health = healthFor(row.completionRate, row.overdueTasks, row.highPriorityOpen)
  return row
}

function buildDistribution(rows: Array<{ label: string; value: number }>) {
  return rows
    .filter((row) => row.value > 0)
    .map((row, index) => ({ ...row, color: chartColors[index % chartColors.length] }))
}

function buildRecommendations(summary: ReportingMetrics["summary"]): ReportingRecommendation[] {
  const recommendations: ReportingRecommendation[] = []

  if (summary.overdueTasks > 0) {
    recommendations.push({
      title: "Clear overdue work",
      detail: `${summary.overdueTasks} open task${summary.overdueTasks === 1 ? " is" : "s are"} past due and dragging down delivery reliability.`,
      href: "/my-tasks",
      tone: "warn",
    })
  }

  if (summary.atRiskProjects > 0) {
    recommendations.push({
      title: "Review at-risk projects",
      detail: `${summary.atRiskProjects} project${summary.atRiskProjects === 1 ? " needs" : "s need"} deadline, scope, or ownership attention.`,
      href: "/clients",
      tone: "warn",
    })
  }

  if (summary.highPriorityOpen > 0) {
    recommendations.push({
      title: "Protect the high-priority queue",
      detail: `${summary.highPriorityOpen} high-priority task${summary.highPriorityOpen === 1 ? " remains" : "s remain"} open in this report window.`,
      href: "/my-tasks",
      tone: "info",
    })
  }

  if (summary.completedTasks > 0 && summary.onTimeRate < 70) {
    recommendations.push({
      title: "Tighten due dates",
      detail: `On-time delivery is ${summary.onTimeRate}%. Start with commitments due this week before adding new work.`,
      href: "/reporting",
      tone: "info",
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: "Strong execution signal",
      detail: "Current work is moving cleanly. Use this window to close goals or unblock teammates before risk appears.",
      href: "/goals",
      tone: "good",
    })
  }

  return recommendations.slice(0, 4)
}

export function buildReportingMetrics({
  filters,
  tasks,
  goals,
  timeEntries,
  teamMembers = [],
  now = new Date(),
}: {
  filters: ReportingFilters
  tasks: ReportingTaskInput[]
  goals: ReportingGoalInput[]
  timeEntries: ReportingTimeEntryInput[]
  teamMembers?: ReportingTeamMemberInput[]
  now?: Date
}): ReportingMetrics {
  const reportTasks = tasks.filter((task) => taskTouchesWindow(task, filters))
  const completedTasks = reportTasks.filter(isComplete)
  const openTasks = reportTasks.filter((task) => !isComplete(task))
  const overdueTasks = openTasks.filter((task) => task.due_date && task.due_date < now)
  const dueSoonTasks = openTasks.filter((task) => task.due_date && task.due_date >= now && task.due_date <= filters.end)
  const highPriorityOpen = openTasks.filter((task) => task.priority === "high")
  const completedWithDueDates = completedTasks.filter((task) => task.due_date && task.completed_at)
  const onTimeCompleted = completedWithDueDates.filter((task) => task.completed_at! <= endOfDay(task.due_date!))
  const goalProgressAverage = goals.length > 0 ? Math.round(goals.reduce((sum, goal) => sum + calculateGoalProgress(goal), 0) / goals.length) : 0
  const focusHours = Math.round(timeEntries.reduce((sum, entry) => sum + entry.minutes, 0) / 60)
  const daysInWindow = Math.max(1, differenceInCalendarDays(filters.end, filters.start) + 1)
  const focusTargetHours = clamp(Math.round(daysInWindow * 4.5), 8, 384)

  const clientRowsById = new Map<string, ReportingBreakdownRow>()
  const projectRowsById = new Map<string, ReportingProjectRow>()
  const assigneeRowsById = new Map<string, ReportingAssigneeRow>()
  const sectionCounts = new Map<string, number>()

  for (const member of teamMembers) {
    assigneeRowsById.set(member.user.id, {
      ...createBreakdownRow(member.user.id, member.user.full_name, null),
      email: member.user.email,
      avatarUrl: member.user.avatar_url,
      qualityScore: null,
      qualityTasks: 0,
      firstPassAcceptance: 0,
      reworkTasks: 0,
    })
  }

  for (const task of reportTasks) {
    const client = task.project?.client || task.client
    const clientId = client?.id || "no-client"
    const clientName = client?.name || "No client"
    const clientColor = client?.color || null

    if (!clientRowsById.has(clientId)) clientRowsById.set(clientId, createBreakdownRow(clientId, clientName, clientColor))
    addTaskToBreakdown(clientRowsById.get(clientId)!, task, now)

    const projectId = task.project?.id || `direct-${clientId}`
    const projectName = task.project?.name || (client ? "Direct client tasks" : "Personal tasks")

    if (!projectRowsById.has(projectId)) {
      projectRowsById.set(projectId, {
        ...createBreakdownRow(projectId, projectName, task.project?.color || clientColor),
        clientName,
        deadline: task.project?.deadline || null,
        status: task.project?.status || "incomplete",
        isDirectWork: !task.project,
      })
    }
    addTaskToBreakdown(projectRowsById.get(projectId)!, task, now)

    const assigneeId = task.assignee?.id || "unassigned"
    if (!assigneeRowsById.has(assigneeId)) {
      assigneeRowsById.set(assigneeId, {
        ...createBreakdownRow(assigneeId, task.assignee?.full_name || "Unassigned", null),
        email: task.assignee?.email || null,
        avatarUrl: task.assignee?.avatar_url || null,
        qualityScore: null,
        qualityTasks: 0,
        firstPassAcceptance: 0,
        reworkTasks: 0,
      })
    }
    addTaskToBreakdown(assigneeRowsById.get(assigneeId)!, task, now)

    if (!isComplete(task)) {
      const sectionName = task.section?.name || task.status.replace(/_/g, " ") || "No section"
      sectionCounts.set(sectionName, (sectionCounts.get(sectionName) || 0) + 1)
    }
  }

  const qualityMonthStart = startOfMonth(filters.end)
  const qualityMonthEnd = endOfMonth(filters.end)
  const qualityWindowTasks = qualityTasksInWindow(tasks, qualityMonthStart, qualityMonthEnd)
  const qualityTasksByAssignee = new Map<string, ReportingTaskInput[]>()
  for (const task of qualityWindowTasks) {
    if (!task.assignee) continue
    const memberTasks = qualityTasksByAssignee.get(task.assignee.id) || []
    memberTasks.push(task)
    qualityTasksByAssignee.set(task.assignee.id, memberTasks)

    if (!assigneeRowsById.has(task.assignee.id)) {
      assigneeRowsById.set(task.assignee.id, {
        ...createBreakdownRow(task.assignee.id, task.assignee.full_name, null),
        email: task.assignee.email,
        avatarUrl: task.assignee.avatar_url,
        qualityScore: null,
        qualityTasks: 0,
        firstPassAcceptance: 0,
        reworkTasks: 0,
      })
    }
  }

  for (const [assigneeId, memberTasks] of qualityTasksByAssignee) {
    const row = assigneeRowsById.get(assigneeId)
    if (!row) continue
    const reviewed = memberTasks.filter((task) => task.quality_score !== null && task.quality_score !== undefined)
    row.qualityTasks = reviewed.length
    row.qualityScore = reviewed.length > 0
      ? Math.round(reviewed.reduce((sum, task) => sum + (task.quality_score || 0), 0) / reviewed.length)
      : null
    row.firstPassAcceptance = calculatePercent(reviewed.filter((task) => (task.rework_count || 0) === 0).length, reviewed.length)
    row.reworkTasks = memberTasks.filter((task) => (task.rework_count || 0) > 0).length
  }

  const clientRows = [...clientRowsById.values()].map(finalizeBreakdownRow).sort((left, right) => right.overdueTasks - left.overdueTasks || right.openTasks - left.openTasks || left.name.localeCompare(right.name))
  const projectRows = [...projectRowsById.values()].map(finalizeBreakdownRow).sort((left, right) => right.overdueTasks - left.overdueTasks || right.openTasks - left.openTasks || left.name.localeCompare(right.name))
  const assigneeRows = [...assigneeRowsById.values()].map(finalizeBreakdownRow).sort((left, right) => right.overdueTasks - left.overdueTasks || right.openTasks - left.openTasks || left.name.localeCompare(right.name))
  const activeProjects = projectRows.filter((row) => !row.isDirectWork).length
  const atRiskProjects = projectRows.filter((row) => !row.isDirectWork && (row.overdueTasks > 0 || (row.deadline && row.deadline < now && row.status !== "complete") || (row.totalTasks >= 3 && row.completionRate < 50))).length
  const completionRate = calculatePercent(completedTasks.length, reportTasks.length)
  const onTimeRate = calculatePercent(onTimeCompleted.length, completedWithDueDates.length)
  const focusRate = calculatePercent(focusHours, focusTargetHours)
  const deliveryReliability = clamp(
    Math.round(completionRate * 0.4 + onTimeRate * 0.35 + goalProgressAverage * 0.15 + Math.max(0, 100 - overdueTasks.length * 8) * 0.1),
    0,
    100
  )

  const trendStart = startOfMonth(subMonths(now, 5))
  const trend = Array.from({ length: 6 }, (_, index) => {
    const month = startOfMonth(addMonths(trendStart, index))
    const monthEnd = endOfMonth(month)

    return {
      label: format(month, "MMM"),
      completed: tasks.filter((task) => task.completed_at && task.completed_at >= month && task.completed_at <= monthEnd).length,
      created: tasks.filter((task) => task.created_at >= month && task.created_at <= monthEnd).length,
    }
  })

  const currentQuality = buildQualitySummary(tasks, qualityMonthStart, qualityMonthEnd)
  const previousMonth = startOfMonth(subMonths(qualityMonthStart, 1))
  const previousMonthQuality = buildQualitySummary(tasks, previousMonth, endOfMonth(previousMonth))
  const quality: ReportingQualitySummary = {
    ...currentQuality,
    monthLabel: format(qualityMonthStart, "MMMM yyyy"),
    previousMonthScore: previousMonthQuality.score,
    previousMonthChange: currentQuality.score !== null && previousMonthQuality.score !== null
      ? currentQuality.score - previousMonthQuality.score
      : null,
  }

  const statusCounts = new Map<string, number>()
  for (const task of reportTasks) {
    const label = task.status.replace(/_/g, " ") || "No status"
    statusCounts.set(label, (statusCounts.get(label) || 0) + 1)
  }

  const priorityCounts = new Map<string, number>()
  for (const task of reportTasks) {
    const label = task.priority || "No priority"
    priorityCounts.set(label, (priorityCounts.get(label) || 0) + 1)
  }

  const bottleneckRows = [...sectionCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value, percentage: calculatePercent(value, openTasks.length) }))

  const summary = {
    totalTasks: reportTasks.length,
    completedTasks: completedTasks.length,
    openTasks: openTasks.length,
    completionRate,
    overdueTasks: overdueTasks.length,
    dueSoonTasks: dueSoonTasks.length,
    highPriorityOpen: highPriorityOpen.length,
    onTimeRate,
    activeProjects,
    atRiskProjects,
    focusHours,
    focusRate,
    deliveryReliability,
    goalProgressAverage,
  }

  return {
    tasks: reportTasks,
    summary,
    trend,
    quality,
    statusDistribution: buildDistribution([...statusCounts.entries()].map(([label, value]) => ({ label, value }))),
    priorityDistribution: buildDistribution([...priorityCounts.entries()].map(([label, value]) => ({ label, value }))),
    clientRows,
    projectRows,
    assigneeRows,
    bottleneckRows,
    recommendations: buildRecommendations(summary),
    upcomingTasks: openTasks
      .filter((task) => task.due_date)
      .sort((left, right) => left.due_date!.getTime() - right.due_date!.getTime())
      .slice(0, 8),
  }
}

export const REPORTING_CSV_HEADERS = [
  "section",
  "name",
  "total_tasks",
  "completed_tasks",
  "open_tasks",
  "overdue_tasks",
  "high_priority_open",
  "completion_rate",
  "health",
  "quality_score",
  "first_pass_acceptance",
  "quality_tasks",
  "rework_tasks",
  "extra",
]

export function buildReportingCsvRows(data: { summary: ReportingMetrics["summary"]; quality: ReportingQualitySummary; clientRows: ReportingBreakdownRow[]; projectRows: ReportingProjectRow[]; assigneeRows: ReportingAssigneeRow[] }) {
  const summaryRows = [
    ["Total tasks", data.summary.totalTasks, "tasks in report window"],
    ["Completion rate", `${data.summary.completionRate}%`, "completed / total"],
    ["Overdue tasks", data.summary.overdueTasks, "open tasks past due"],
    ["On-time delivery", `${data.summary.onTimeRate}%`, "completed by due date"],
    ["At-risk projects", data.summary.atRiskProjects, "project risk count"],
    ["Delivery reliability", `${data.summary.deliveryReliability}%`, "composite execution score"],
    ["Quality score", data.quality.score === null ? "N/A" : `${data.quality.score}%`, "automatic score for tasks first submitted in the report window"],
    ["First-pass acceptance", `${data.quality.firstPassAcceptance}%`, `${data.quality.reviewedTasks} reviewed tasks`],
    ["Quality rework", data.quality.totalReworkCycles, `${data.quality.reworkTasks} tasks needed scored rework`],
    ["Quality blockers", data.quality.blockers, `${data.quality.pendingTasks} pending quality decisions`],
  ].map(([name, value, extra]) => ({
    section: "kpi",
    name,
    total_tasks: value,
    completed_tasks: "",
    open_tasks: "",
    overdue_tasks: "",
    high_priority_open: "",
    completion_rate: "",
    health: "",
    quality_score: "",
    first_pass_acceptance: "",
    quality_tasks: "",
    rework_tasks: "",
    extra,
  }))

  const rowsForBreakdown = (section: string, rows: ReportingBreakdownRow[]) => rows.map((row) => ({
    section,
    name: row.name,
    total_tasks: row.totalTasks,
    completed_tasks: row.completedTasks,
    open_tasks: row.openTasks,
    overdue_tasks: row.overdueTasks,
    high_priority_open: row.highPriorityOpen,
    completion_rate: `${row.completionRate}%`,
    health: row.health,
    quality_score: "qualityScore" in row ? (row as ReportingAssigneeRow).qualityScore ?? "N/A" : "",
    first_pass_acceptance: "qualityScore" in row ? `${(row as ReportingAssigneeRow).firstPassAcceptance}%` : "",
    quality_tasks: "qualityScore" in row ? (row as ReportingAssigneeRow).qualityTasks : "",
    rework_tasks: "qualityScore" in row ? (row as ReportingAssigneeRow).reworkTasks : "",
    extra: "clientName" in row ? (row as ReportingProjectRow).clientName : "email" in row ? (row as ReportingAssigneeRow).email || "" : "",
  }))

  return [
    ...summaryRows,
    ...rowsForBreakdown("client", data.clientRows),
    ...rowsForBreakdown("project", data.projectRows),
    ...rowsForBreakdown("assignee", data.assigneeRows),
  ]
}
