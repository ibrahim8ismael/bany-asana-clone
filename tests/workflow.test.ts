import assert from "node:assert/strict"
import test from "node:test"
import {
  deriveProjectCompletionStatus,
  isProjectStatus,
  isQualityWorkflowStatusConsistent,
  isTaskWorkflowStage,
  TASK_WORKFLOW_STAGES,
  validateManualTaskTransition,
} from "../src/lib/workflow"

test("shared workflow defines the six canonical task stages once", () => {
  assert.deepEqual(
    TASK_WORKFLOW_STAGES.map((stage) => stage.id),
    ["backlog", "incomplete", "in_progress", "submitted_for_review", "needs_rework", "complete"]
  )
  assert.equal(isTaskWorkflowStage("backlog"), true)
  assert.equal(isTaskWorkflowStage("project"), false)
  assert.equal(isProjectStatus("in_progress"), true)
  assert.equal(isProjectStatus("backlog"), false, "projects cannot enter task workflow stages")
})

test("Backlog is a persisted task status with ordinary manual transitions", () => {
  assert.equal(validateManualTaskTransition({
    from: "incomplete",
    to: "backlog",
    qualityRequired: false,
    qualityState: "not_required",
  }), null)
})

test("normal task updates cannot enter quality-controlled stages", () => {
  assert.match(validateManualTaskTransition({
    from: "in_progress",
    to: "submitted_for_review",
    qualityRequired: true,
    qualityState: "ready",
  }) || "", /quality review/i)
  assert.match(validateManualTaskTransition({
    from: "in_progress",
    to: "needs_rework",
    qualityRequired: false,
    qualityState: "not_required",
  }) || "", /quality review/i)
})

test("quality-controlled tasks cannot bypass review by completing manually", () => {
  assert.match(validateManualTaskTransition({
    from: "in_progress",
    to: "complete",
    qualityRequired: true,
    qualityState: "ready",
  }) || "", /approved/i)
  assert.match(validateManualTaskTransition({
    from: "needs_rework",
    to: "in_progress",
    qualityRequired: true,
    qualityState: "needs_rework",
  }) || "", /quality review/i)
})

test("quality workflow statuses remain synchronized with quality state", () => {
  assert.equal(isQualityWorkflowStatusConsistent("submitted_for_review", "submitted"), true)
  assert.equal(isQualityWorkflowStatusConsistent("submitted_for_review", "ready"), false)
  assert.equal(isQualityWorkflowStatusConsistent("needs_rework", "needs_rework"), true)
  assert.equal(isQualityWorkflowStatusConsistent("needs_rework", "not_required"), false)
})

test("project completion requires at least one task and every task complete", () => {
  assert.equal(deriveProjectCompletionStatus("complete", []), "incomplete")
  assert.equal(deriveProjectCompletionStatus("incomplete", ["complete"]), "complete")
  assert.equal(deriveProjectCompletionStatus("complete", ["complete", "needs_rework"]), "in_progress")
  assert.equal(deriveProjectCompletionStatus("in_progress", ["backlog", "complete"]), "in_progress")
})
