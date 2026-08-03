import test from "node:test"
import assert from "node:assert/strict"
import {
  buildQualityDecisionTaskUpdate,
  calculateGradeKpiScore,
  calculateTaskQualityScore,
  issueAffectsQualityScore,
  resolveQualityReviewOutcome,
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
