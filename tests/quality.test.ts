import test from "node:test"
import assert from "node:assert/strict"
import {
  buildQualitySubmissionTaskUpdate,
  buildQualityDecisionTaskUpdate,
  calculateGradeKpiScore,
  calculateTaskQualityScore,
  issueAffectsQualityScore,
  isPendingQualityReviewTask,
  isQualityReworkTask,
  resolveQualityReviewOutcome,
  validateQualityReviewTransition,
  validateQualitySubmissionTransition,
} from "@/lib/quality"

test("quality score follows the automatic rework bands", () => {
  assert.equal(calculateTaskQualityScore({ reworkCount: 0, hasCountedBlocker: false, approvedWithNotes: false }), 100)
  assert.equal(calculateTaskQualityScore({ reworkCount: 0, hasCountedBlocker: false, approvedWithNotes: true }), 90)
  assert.equal(calculateTaskQualityScore({ reworkCount: 1, hasCountedBlocker: false, approvedWithNotes: false }), 75)
  assert.equal(calculateTaskQualityScore({ reworkCount: 2, hasCountedBlocker: false, approvedWithNotes: false }), 55)
  assert.equal(calculateTaskQualityScore({ reworkCount: 3, hasCountedBlocker: false, approvedWithNotes: false }), 35)
})

test("a counted blocker caps the task score", () => {
  assert.equal(calculateTaskQualityScore({ reworkCount: 0, hasCountedBlocker: true, approvedWithNotes: false }), 50)
  assert.equal(calculateTaskQualityScore({ reworkCount: 2, hasCountedBlocker: true, approvedWithNotes: false }), 50)
})

test("review outcome is derived from concrete checks", () => {
  assert.equal(resolveQualityReviewOutcome({ allCriteriaPassed: true, severities: [] }), "approved")
  assert.equal(resolveQualityReviewOutcome({ allCriteriaPassed: true, severities: ["minor"] }), "approved_with_notes")
  assert.equal(resolveQualityReviewOutcome({ allCriteriaPassed: false, severities: [] }), "needs_rework")
  assert.equal(resolveQualityReviewOutcome({ allCriteriaPassed: true, severities: ["major"] }), "needs_rework")
  assert.equal(resolveQualityReviewOutcome({ allCriteriaPassed: true, severities: ["blocker"] }), "needs_rework")
})

test("scope and review process problems do not reduce the assignee score", () => {
  assert.equal(issueAffectsQualityScore("execution_gap"), true)
  assert.equal(issueAffectsQualityScore("unresolved"), true)
  assert.equal(issueAffectsQualityScore("regression"), true)
  assert.equal(issueAffectsQualityScore("reviewer_missed"), false)
  assert.equal(issueAffectsQualityScore("scope_change"), false)
  assert.equal(issueAffectsQualityScore("unclear_requirements"), false)
})

test("grade KPI keeps the first grade and penalizes repeated failed cycles", () => {
  assert.equal(calculateGradeKpiScore("excellent", 0), 100)
  assert.equal(calculateGradeKpiScore("good", 0), 85)
  assert.equal(calculateGradeKpiScore("needs_rework", 1), 60)
  assert.equal(calculateGradeKpiScore("needs_rework", 2), 50)
  assert.equal(calculateGradeKpiScore("needs_rework", 3), 40)
  assert.equal(calculateGradeKpiScore("major_rework", 2), 20)
})

test("Needs Rework is persisted through the quality decision with counters and deadline", () => {
  const dueDate = new Date("2026-08-10T12:00:00.000Z")
  const update = buildQualityDecisionTaskUpdate({
    outcome: "needs_rework",
    now: new Date("2026-08-03T12:00:00.000Z"),
    reworkDueDate: dueDate,
    firstAccountableGrade: "needs_rework",
    finalGrade: "needs_rework",
    qualityScore: 60,
    reworkCount: 1,
    blockerCount: 0,
  })

  assert.equal(update.status, "needs_rework")
  assert.equal(update.quality_state, "needs_rework")
  assert.equal(update.rework_due_date, dueDate)
  assert.equal(update.rework_count, 1)
  assert.equal(update.completed_at, null)
})

test("quality workflow preserves both status fields through submit, rework, resubmit, and approval", () => {
  const firstSubmissionAt = new Date("2026-08-03T12:00:00.000Z")
  assert.equal(validateQualitySubmissionTransition({
    status: "in_progress",
    qualityState: "ready",
    effectivePolicy: "required",
  }), null)

  const firstSubmission = buildQualitySubmissionTaskUpdate({
    reviewerId: "reviewer-1",
    now: firstSubmissionAt,
    firstSubmittedAt: null,
    originalDueDate: null,
    dueDate: new Date("2026-08-04T12:00:00.000Z"),
  })
  assert.equal(firstSubmission.status, "submitted_for_review")
  assert.equal(firstSubmission.quality_state, "submitted")
  assert.equal(isPendingQualityReviewTask({
    status: firstSubmission.status,
    qualityState: firstSubmission.quality_state,
  }), true)
  assert.equal(validateQualityReviewTransition({
    status: firstSubmission.status,
    qualityState: firstSubmission.quality_state,
    pendingReviewCount: 1,
  }), null)

  const rework = buildQualityDecisionTaskUpdate({
    outcome: "needs_rework",
    now: new Date("2026-08-04T12:00:00.000Z"),
    reworkDueDate: new Date("2026-08-06T12:00:00.000Z"),
    firstAccountableGrade: "needs_rework",
    finalGrade: "needs_rework",
    qualityScore: 60,
    reworkCount: 1,
    blockerCount: 0,
  })
  assert.equal(isQualityReworkTask({ status: rework.status, qualityState: rework.quality_state }), true)
  assert.equal(validateQualitySubmissionTransition({
    status: rework.status,
    qualityState: rework.quality_state,
    effectivePolicy: "required",
  }), null)

  const resubmission = buildQualitySubmissionTaskUpdate({
    reviewerId: "reviewer-1",
    now: new Date("2026-08-05T12:00:00.000Z"),
    firstSubmittedAt: firstSubmissionAt,
    originalDueDate: firstSubmission.original_due_date,
    dueDate: new Date("2026-08-04T12:00:00.000Z"),
  })
  assert.equal(resubmission.status, "submitted_for_review")
  assert.equal(resubmission.quality_state, "submitted")

  const approval = buildQualityDecisionTaskUpdate({
    outcome: "approved",
    now: new Date("2026-08-06T12:00:00.000Z"),
    reworkDueDate: null,
    firstAccountableGrade: "needs_rework",
    finalGrade: "good",
    qualityScore: 60,
    reworkCount: 1,
    blockerCount: 0,
  })
  assert.equal(approval.status, "complete")
  assert.equal(approval.quality_state, "approved")
  assert.equal(isPendingQualityReviewTask({ status: approval.status, qualityState: approval.quality_state }), false)
  assert.equal(isQualityReworkTask({ status: approval.status, qualityState: approval.quality_state }), false)
})

test("quality actions reject mismatched workflow state and duplicate pending reviews", () => {
  assert.match(validateQualitySubmissionTransition({
    status: "in_progress",
    qualityState: "needs_rework",
    effectivePolicy: "required",
  }) || "", /out of sync/i)
  assert.match(validateQualityReviewTransition({
    status: "submitted_for_review",
    qualityState: "ready",
    pendingReviewCount: 1,
  }) || "", /not currently in review/i)
  assert.match(validateQualityReviewTransition({
    status: "submitted_for_review",
    qualityState: "submitted",
    pendingReviewCount: 2,
  }) || "", /exactly one/i)
})
