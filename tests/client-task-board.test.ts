import assert from "node:assert/strict"
import test from "node:test"
import {
  CLIENT_TASK_LAYOUT_STORAGE_KEY,
  emptyClientTaskBoardCounts,
  insertCreatedTaskIntoBoardColumn,
  mergeClientTaskBoardCounts,
  moveTaskBetweenBoardColumns,
  reconcileTaskAcrossBoardColumns,
} from "../src/lib/client-task-board"
import { TASK_WORKFLOW_STAGES, validateManualTaskTransition } from "../src/lib/workflow"

function makeColumns(taskLists: Record<string, any[]>) {
  return Object.fromEntries(Object.entries(taskLists).map(([stageId, tasks]) => [stageId, {
    tasks,
    page: 1,
    total: tasks.length,
    totalPages: 1,
    loading: false,
  }]))
}

const taskA = { id: "task-a", title: "A", status: "incomplete" }
const taskB = { id: "task-b", title: "B", status: "complete" }

test("board counts default to zero for every canonical workflow stage", () => {
  const counts = emptyClientTaskBoardCounts()
  assert.deepEqual(Object.keys(counts).sort(), TASK_WORKFLOW_STAGES.map((stage) => stage.id).sort())
  assert.equal(TASK_WORKFLOW_STAGES.every((stage) => counts[stage.id] === 0), true)
})

test("grouped rows merge into complete bucket totals without inventing statuses", () => {
  const counts = mergeClientTaskBoardCounts([
    { status: "complete", count: 1677 },
    { status: "in_progress", count: 85 },
    { status: "mystery_status", count: 5 },
  ])
  assert.equal(counts.complete, 1677)
  assert.equal(counts.in_progress, 85)
  assert.equal(counts.backlog, 0)
  assert.equal("mystery_status" in counts, false)
})

test("reconcile moves a loaded task into its new status column preserving card data", () => {
  const columns = makeColumns({ incomplete: [{ ...taskA, client_project: { name: "Pandoz" } }], complete: [{ ...taskB }] })
  const next = reconcileTaskAcrossBoardColumns(columns, { id: "task-a", status: "complete", title: "A renamed" })
  assert.ok(next)
  assert.equal(next.incomplete.tasks.length, 0)
  assert.equal(next.complete.tasks[0].id, "task-a")
  assert.equal(next.complete.tasks[0].title, "A renamed")
  assert.deepEqual(next.complete.tasks[0].client_project, { name: "Pandoz" })
})

test("reconcile returns null when the task was never loaded so counts stay server-driven", () => {
  const columns = makeColumns({ incomplete: [], complete: [] })
  assert.equal(reconcileTaskAcrossBoardColumns(columns, { id: "task-z", status: "complete", title: "Z" }), null)
})

test("optimistic drag moves a card between columns and marks its new status", () => {
  const columns = makeColumns({ incomplete: [{ ...taskA }], complete: [{ ...taskB }] })
  const moved = moveTaskBetweenBoardColumns(columns, "task-a", "incomplete", "complete")
  assert.ok(moved)
  assert.equal(moved.columns.incomplete.tasks.length, 0)
  assert.equal(moved.columns.complete.tasks[0].id, "task-a")
  assert.equal(moved.columns.complete.tasks[0].status, "complete")
})

test("optimistic drag fails safely without source or destination columns", () => {
  const columns = makeColumns({ incomplete: [{ ...taskA }], complete: [] })
  assert.equal(moveTaskBetweenBoardColumns(columns, "task-a", "missing", "complete"), null)
  assert.equal(moveTaskBetweenBoardColumns(columns, "task-z", "incomplete", "complete"), null)
})

test("created tasks are inserted into the exact clicked bucket with a bumped total", () => {
  const columns = makeColumns({ backlog: [], incomplete: [] })
  const next = insertCreatedTaskIntoBoardColumn(columns, { id: "task-n", title: "N", status: "backlog" })
  assert.ok(next)
  assert.equal(next.backlog.total, 1)
  assert.equal(next.backlog.tasks[0].id, "task-n")
  assert.equal(next.incomplete.total, 0)
})

test("created tasks cannot land in a quality-controlled bucket through the UI helper", () => {
  const columns = makeColumns({ submitted_for_review: [], needs_rework: [], backlog: [] })
  assert.equal(insertCreatedTaskIntoBoardColumn(columns, { id: "task-q", status: "submitted_for_review" }), null)
})

test("manual creation cannot target quality-controlled workflow buckets", () => {
  for (const stage of TASK_WORKFLOW_STAGES.filter((entry) => !entry.manualTransition)) {
    const error = validateManualTaskTransition({
      from: "incomplete",
      to: stage.id,
      qualityRequired: false,
      qualityState: "not_required",
    })
    assert.match(error || "", /quality review workflow/)
  }
})

test("Backlog, To Do, In Progress, and Done are valid exact creation destinations", () => {
  const manualStages = TASK_WORKFLOW_STAGES.filter((stage) => stage.manualTransition)
  assert.deepEqual(manualStages.map((stage) => stage.id), ["backlog", "incomplete", "in_progress", "complete"])

  for (const stage of manualStages) {
    assert.equal(validateManualTaskTransition({
      from: "incomplete",
      to: stage.id,
      qualityRequired: false,
      qualityState: "not_required",
    }), null)
  }
})

test("layout preference key only stores presentation state", () => {
  assert.equal(CLIENT_TASK_LAYOUT_STORAGE_KEY, "client-task-layout")
})
