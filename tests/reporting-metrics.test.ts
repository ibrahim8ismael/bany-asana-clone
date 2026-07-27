import test from "node:test"
import assert from "node:assert/strict"
import { buildQualitySummary, buildReportingMetrics, calculatePercent, resolveReportingFilters, type ReportingTaskInput } from "@/lib/reporting-metrics"

const now = new Date("2026-05-10T12:00:00")

function task(overrides: Partial<ReportingTaskInput>): ReportingTaskInput {
  return {
    id: "task",
    title: "Task",
    status: "todo",
    priority: null,
    due_date: null,
    completed_at: null,
    created_at: new Date("2026-05-01T09:00:00"),
    updated_at: new Date("2026-05-01T09:00:00"),
    assignee_id: null,
    assignee: null,
    project: null,
    client: null,
    section: null,
    ...overrides,
  }
}

function project(id: string, name: string, clientId: string, clientName: string) {
  return {
    id,
    name,
    color: null,
    status: "in_progress",
    deadline: null,
    client_id: clientId,
    client: { id: clientId, name: clientName, color: null },
  }
}

test("calculatePercent handles empty totals", () => {
  assert.equal(calculatePercent(1, 4), 25)
  assert.equal(calculatePercent(1, 0), 0)
})

test("resolveReportingFilters supports custom ranges", () => {
  const filters = resolveReportingFilters({ period: "custom", start: "2026-04-01", end: "2026-04-15", scope: "team" }, now)

  assert.equal(filters.period, "custom")
  assert.equal(filters.scope, "team")
  assert.equal(filters.start.getFullYear(), 2026)
  assert.equal(filters.start.getMonth(), 3)
  assert.equal(filters.start.getDate(), 1)
  assert.equal(filters.end.getFullYear(), 2026)
  assert.equal(filters.end.getMonth(), 3)
  assert.equal(filters.end.getDate(), 15)
})

test("buildReportingMetrics calculates delivery and breakdown KPIs", () => {
  const filters = resolveReportingFilters({ period: "month", scope: "team" }, now)
  const tasks = [
    task({
      id: "complete-on-time",
      title: "Complete on time",
      status: "complete",
      due_date: new Date("2026-05-04T09:00:00"),
      completed_at: new Date("2026-05-03T09:00:00"),
      project: project("project-a", "Launch", "client-a", "Acme"),
    }),
    task({
      id: "overdue-high",
      title: "Overdue high",
      priority: "high",
      due_date: new Date("2026-05-01T09:00:00"),
      project: project("project-a", "Launch", "client-a", "Acme"),
      section: { id: "todo", name: "To do" },
    }),
    task({
      id: "open-future",
      title: "Future task",
      priority: "medium",
      due_date: new Date("2026-05-20T09:00:00"),
      project: project("project-b", "Website", "client-b", "Beta"),
      section: { id: "review", name: "Review" },
    }),
    task({
      id: "complete-late-direct",
      title: "Complete late direct",
      status: "complete",
      due_date: new Date("2026-05-02T09:00:00"),
      completed_at: new Date("2026-05-05T09:00:00"),
      client: { id: "client-a", name: "Acme", color: null },
    }),
    task({
      id: "old-complete",
      title: "Old complete",
      status: "complete",
      due_date: new Date("2026-04-14T09:00:00"),
      completed_at: new Date("2026-04-15T09:00:00"),
      created_at: new Date("2026-04-01T09:00:00"),
    }),
  ]

  const metrics = buildReportingMetrics({
    filters,
    tasks,
    goals: [{ id: "goal", name: "Goal", status: "on_track", target_value: 100, current_value: 80, due_date: null }],
    timeEntries: [{ minutes: 120, date: now }],
    now,
  })

  assert.equal(metrics.summary.totalTasks, 4)
  assert.equal(metrics.summary.completedTasks, 2)
  assert.equal(metrics.summary.openTasks, 2)
  assert.equal(metrics.summary.overdueTasks, 1)
  assert.equal(metrics.summary.highPriorityOpen, 1)
  assert.equal(metrics.summary.completionRate, 50)
  assert.equal(metrics.summary.onTimeRate, 50)
  assert.equal(metrics.summary.activeProjects, 2)
  assert.equal(metrics.summary.atRiskProjects, 1)
  assert.equal(metrics.summary.focusHours, 2)

  const acme = metrics.clientRows.find((row) => row.id === "client-a")
  assert.equal(acme?.totalTasks, 3)
  assert.equal(acme?.overdueTasks, 1)
  assert.equal(acme?.health, "At risk")
})

test("monthly quality uses first submission month and excludes pending scores", () => {
  const tasks = [
    task({ id: "first-pass", first_submitted_at: new Date("2026-05-02T09:00:00"), quality_score: 100, first_quality_grade: "excellent", rework_count: 0, quality_blocker_count: 0 }),
    task({ id: "one-rework", first_submitted_at: new Date("2026-05-03T09:00:00"), quality_score: 75, first_quality_grade: "needs_rework", rework_count: 1, quality_blocker_count: 0 }),
    task({ id: "pending", first_submitted_at: new Date("2026-05-04T09:00:00"), quality_score: null, rework_count: 0, quality_blocker_count: 0 }),
    task({ id: "previous-month", first_submitted_at: new Date("2026-04-30T09:00:00"), quality_score: 35, rework_count: 3, quality_blocker_count: 1 }),
  ]

  const quality = buildQualitySummary(tasks, new Date("2026-05-01T00:00:00"), new Date("2026-05-31T23:59:59"))

  assert.equal(quality.score, 88)
  assert.equal(quality.reviewedTasks, 2)
  assert.equal(quality.pendingTasks, 1)
  assert.equal(quality.firstPassAcceptance, 50)
  assert.equal(quality.reworkTasks, 1)
  assert.equal(quality.totalReworkCycles, 1)
  assert.equal(quality.blockers, 0)
  assert.equal(quality.isProvisional, true)
  assert.deepEqual(quality.gradeDistribution, { excellent: 1, good: 0, needsRework: 1, majorRework: 0 })
})
