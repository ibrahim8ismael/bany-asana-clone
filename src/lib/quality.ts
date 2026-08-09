export const QUALITY_ISSUE_SEVERITIES = ["minor", "major", "blocker"] as const

export const QUALITY_ISSUE_REASONS = [
  "execution_gap",
  "unresolved",
  "regression",
  "reviewer_missed",
  "scope_change",
  "unclear_requirements",
] as const

export type QualityIssueSeverity = (typeof QUALITY_ISSUE_SEVERITIES)[number]
export type QualityIssueReason = (typeof QUALITY_ISSUE_REASONS)[number]

export const QUALITY_GRADES = ["excellent", "good", "needs_rework", "major_rework"] as const
export type QualityGrade = (typeof QUALITY_GRADES)[number]

export const QUALITY_GRADE_CONFIG: Record<QualityGrade, {
  label: string
  score: number
  decision: "approved" | "approved_with_notes" | "needs_rework"
  description: string
}> = {
  excellent: {
    label: "Excellent",
    score: 100,
    decision: "approved",
    description: "Complete, accurate, and ready without corrections.",
  },
  good: {
    label: "Good",
    score: 85,
    decision: "approved_with_notes",
    description: "Accepted with minor notes that do not block completion.",
  },
  needs_rework: {
    label: "Needs Rework",
    score: 60,
    decision: "needs_rework",
    description: "Not accepted yet. Clear corrections are required.",
  },
  major_rework: {
    label: "Major Rework",
    score: 30,
    decision: "needs_rework",
    description: "The delivery is unusable or substantially outside the requirement.",
  },
}

export const QUALITY_REASON_LABELS: Record<QualityIssueReason, string> = {
  execution_gap: "Execution gap",
  unresolved: "Previous finding not resolved",
  regression: "New issue caused by the fix",
  reviewer_missed: "Missed in the previous review",
  scope_change: "Scope changed",
  unclear_requirements: "Requirements were unclear",
}

export function issueAffectsQualityScore(reason: QualityIssueReason) {
  return reason === "execution_gap" || reason === "unresolved" || reason === "regression"
}

export function calculateGradeKpiScore(firstGrade: QualityGrade, scoredReworkCount: number) {
  const baseScore = QUALITY_GRADE_CONFIG[firstGrade].score
  const repeatedReworkPenalty = Math.max(0, scoredReworkCount - 1) * 10
  return Math.max(0, baseScore - repeatedReworkPenalty)
}

export function calculateTaskQualityScore({
  reworkCount,
  hasCountedBlocker,
  approvedWithNotes,
}: {
  reworkCount: number
  hasCountedBlocker: boolean
  approvedWithNotes: boolean
}) {
  let score: number

  if (reworkCount <= 0) score = approvedWithNotes ? 90 : 100
  else if (reworkCount === 1) score = 75
  else if (reworkCount === 2) score = 55
  else score = 35

  return hasCountedBlocker ? Math.min(score, 50) : score
}

export function resolveQualityReviewOutcome({
  allCriteriaPassed,
  severities,
}: {
  allCriteriaPassed: boolean
  severities: QualityIssueSeverity[]
}) {
  const requiresRework = !allCriteriaPassed || severities.some((severity) => severity === "major" || severity === "blocker")
  if (requiresRework) return "needs_rework" as const
  return severities.includes("minor") ? "approved_with_notes" as const : "approved" as const
}

export function buildQualityDecisionTaskUpdate(input: {
  outcome: "approved" | "approved_with_notes" | "needs_rework"
  now: Date
  reworkDueDate: Date | null
  firstAccountableGrade: QualityGrade | null
  finalGrade: QualityGrade
  qualityScore: number | null
  reworkCount: number
  blockerCount: number
}) {
  if (input.outcome === "needs_rework") {
    return {
      status: "needs_rework",
      quality_state: "needs_rework",
      rework_due_date: input.reworkDueDate,
      completed_at: null,
      first_quality_grade: input.firstAccountableGrade,
      quality_score: input.qualityScore,
      rework_count: input.reworkCount,
      quality_blocker_count: input.blockerCount,
    } as const
  }

  return {
    status: "complete",
    quality_state: input.outcome,
    rework_due_date: null,
    completed_at: input.now,
    approved_at: input.now,
    first_quality_grade: input.firstAccountableGrade,
    final_quality_grade: input.finalGrade,
    quality_score: input.qualityScore,
    rework_count: input.reworkCount,
    quality_blocker_count: input.blockerCount,
  } as const
}
