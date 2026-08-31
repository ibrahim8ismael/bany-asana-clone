"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import {
  assignTaskReviewer,
  getTaskQuality,
  reviewTaskQualityGrade,
  submitTaskForReview,
} from "@/actions/quality-actions"
import { Button } from "@/components/ui/button"
import {
  QUALITY_GRADE_CONFIG,
  QUALITY_GRADES,
  QUALITY_REASON_LABELS,
  type QualityGrade,
  type QualityIssueReason,
} from "@/lib/quality"

interface QualityUser {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
}

interface QualityTaskSummary {
  id: string
  title: string
  status: string
  assignee_id?: string | null
  creator_id?: string | null
  reviewer_id?: string | null
  quality_required?: boolean
  quality_state?: string
}

interface QualityFinding {
  id: string
  severity: string
  reason: QualityIssueReason
  description: string
}

interface QualityReview {
  id: string
  cycle_number: number
  status: string
  grade: QualityGrade | null
  score: number | null
  decision: string | null
  submission_note: string | null
  submitted_at: string | Date
  review_due_at: string | Date
  reviewed_at: string | Date | null
  review_note: string | null
  rework_due_date: string | Date | null
  affects_score: boolean
  submitter: QualityUser
  reviewer: QualityUser
  issues: QualityFinding[]
}

interface QualityData {
  task: QualityTaskSummary & {
    due_date?: string | Date | null
    original_due_date?: string | Date | null
    rework_due_date?: string | Date | null
    approved_at?: string | Date | null
    quality_score?: number | null
    first_quality_grade?: QualityGrade | null
    final_quality_grade?: QualityGrade | null
    review_cycle_count: number
    rework_count: number
    quality_blocker_count: number
    assignee?: QualityUser | null
    creator: QualityUser
    reviewer?: QualityUser | null
    project?: {
      id: string
      name: string
      quality_policy: string
      default_reviewer_id: string | null
      review_sla_days: number
    } | null
    quality_reviews: QualityReview[]
  }
  suggestedReviewer: QualityUser | null
  effectivePolicy: "off" | "optional" | "required"
  permissions: {
    isSubmitter: boolean
    canAssignReviewer: boolean
    canSubmit: boolean
    canReview: boolean
  }
}

interface QualityActionResult {
  success?: boolean
  error?: string
  task?: QualityData["task"]
  suggestedReviewer?: QualityUser | null
  effectivePolicy?: QualityData["effectivePolicy"]
  permissions?: QualityData["permissions"]
  taskUpdate?: Record<string, unknown>
}

interface DraftFinding {
  key: string
  reason: QualityIssueReason
  description: string
}

const stateLabels: Record<string, string> = {
  not_required: "Not submitted",
  ready: "Ready to submit",
  submitted: "Awaiting review",
  needs_rework: "Needs rework",
  approved: "Approved",
  approved_with_notes: "Approved with notes",
}

function formatDate(value?: string | Date | null, pattern = "MMM d, yyyy") {
  if (!value) return "Not set"
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? "Not set" : format(date, pattern)
}

function newFinding(): DraftFinding {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    reason: "execution_gap",
    description: "",
  }
}

export default function TaskQualityPanel({
  task,
  users,
  onTaskUpdated,
  onActivityRefresh,
}: {
  task: QualityTaskSummary
  users: QualityUser[]
  onTaskUpdated: (updates: Partial<QualityTaskSummary> & Record<string, unknown>) => void
  onActivityRefresh: () => Promise<void>
}) {
  const router = useRouter()
  const [data, setData] = useState<QualityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [submissionNote, setSubmissionNote] = useState("")
  const [selectedGrade, setSelectedGrade] = useState<QualityGrade | null>(null)
  const [findings, setFindings] = useState<DraftFinding[]>([])
  const [reviewNote, setReviewNote] = useState("")
  const [reworkDueDate, setReworkDueDate] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    void getTaskQuality(task.id).then((result) => {
      if (cancelled) return
      const actionResult = result as QualityActionResult
      if (actionResult.success && actionResult.task && actionResult.permissions && actionResult.effectivePolicy) {
        setData({
          task: actionResult.task,
          suggestedReviewer: actionResult.suggestedReviewer || null,
          effectivePolicy: actionResult.effectivePolicy,
          permissions: actionResult.permissions,
        })
      } else {
        setError(actionResult.error || "Could not load quality review")
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [task.id])

  const applyActionResult = async (result: QualityActionResult) => {
    if (result.success && result.task && result.permissions && result.effectivePolicy) {
      setData({
        task: result.task,
        suggestedReviewer: result.suggestedReviewer || null,
        effectivePolicy: result.effectivePolicy,
        permissions: result.permissions,
      })
      if (result.taskUpdate) onTaskUpdated(result.taskUpdate)
      setError("")
      await onActivityRefresh()
      router.refresh()
      return true
    }
    setError(result.error || "The quality action could not be completed")
    return false
  }

  const handleReviewerChange = async (reviewerId: string) => {
    setSaving(true)
    await applyActionResult(await assignTaskReviewer(task.id, reviewerId) as QualityActionResult)
    setSaving(false)
  }

  const handleSubmit = async () => {
    setSaving(true)
    const success = await applyActionResult(await submitTaskForReview(task.id, { submissionNote }) as QualityActionResult)
    if (success) setSubmissionNote("")
    setSaving(false)
  }

  const handleReview = async () => {
    if (!selectedGrade) return
    setSaving(true)
    const success = await applyActionResult(await reviewTaskQualityGrade(task.id, {
      grade: selectedGrade,
      findings: findings.map(({ reason, description }) => ({ reason, description })),
      reviewNote,
      reworkDueDate: reworkDueDate || null,
    }) as QualityActionResult)
    if (success) {
      setSelectedGrade(null)
      setFindings([])
      setReviewNote("")
      setReworkDueDate("")
    }
    setSaving(false)
  }

  if (loading) {
    return <section className="rounded-xl border border-gray-200 p-4 text-sm text-gray-400 dark:border-zinc-800"><ShieldCheck className="mr-2 inline h-4 w-4" />Loading quality workflow...</section>
  }
  if (!data) {
    return <section className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500">{error}</section>
  }

  const qualityTask = data.task
  const pendingReview = qualityTask.quality_reviews.find((review) => review.status === "pending")
  const latestReviewed = qualityTask.quality_reviews.find((review) => review.status !== "pending")
  const reviewer = qualityTask.reviewer || data.suggestedReviewer
  const needsReworkDecision = selectedGrade ? QUALITY_GRADE_CONFIG[selectedGrade].decision === "needs_rework" : false
  const eligibleReviewers = users.filter((user) => user.id !== (qualityTask.assignee_id || qualityTask.creator_id))
  const workflowActive = qualityTask.quality_state !== "not_required" || qualityTask.quality_required
  const policyLabel = data.effectivePolicy === "required" ? "Required" : data.effectivePolicy === "optional" ? "Optional" : "Off"

  if (data.effectivePolicy === "off" && !workflowActive) return null
  if (qualityTask.status === "complete" && !workflowActive) return null

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50/70 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"><ShieldCheck className="h-4 w-4" /></span>
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Quality review</h4>
            <p className="text-xs text-gray-500 dark:text-zinc-400">{policyLabel} for this project · grade-based review</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${qualityTask.quality_state === "needs_rework" ? "bg-rose-500/10 text-rose-500" : qualityTask.quality_state === "submitted" ? "bg-amber-500/10 text-amber-600 dark:text-amber-300" : (qualityTask.quality_state || "").startsWith("approved") ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"}`}>
          {stateLabels[qualityTask.quality_state || "not_required"] || qualityTask.quality_state}
        </span>
      </div>

      {error ? <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-500">{error}</div> : null}

      <div className="grid gap-px border-t border-gray-200 bg-gray-200 dark:border-zinc-800 dark:bg-zinc-800 sm:grid-cols-3">
        <div className="bg-white px-4 py-3 dark:bg-zinc-950/40">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Reviewer</div>
          {data.permissions.canAssignReviewer ? (
            <select
              value={qualityTask.reviewer_id || reviewer?.id || ""}
              disabled={saving}
              onChange={(event) => void handleReviewerChange(event.target.value)}
              className="mt-1 w-full bg-transparent text-sm font-medium text-gray-800 outline-none dark:text-zinc-200"
            >
              <option value="">Choose reviewer</option>
              {eligibleReviewers.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          ) : (
            <div className="mt-1 truncate text-sm font-medium text-gray-800 dark:text-zinc-200">{reviewer?.full_name || "Not assigned"}</div>
          )}
        </div>
        <div className="bg-white px-4 py-3 dark:bg-zinc-950/40">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">KPI score</div>
          <div className="mt-1 text-sm font-medium text-gray-800 dark:text-zinc-200">{qualityTask.quality_score ?? "Pending"}</div>
        </div>
        <div className="bg-white px-4 py-3 dark:bg-zinc-950/40">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Review cycles</div>
          <div className="mt-1 text-sm font-medium text-gray-800 dark:text-zinc-200">{qualityTask.review_cycle_count}</div>
        </div>
      </div>

      {data.permissions.canSubmit ? (
        <div className="space-y-3 border-t border-gray-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/30">
          <div>
            <h5 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{qualityTask.quality_state === "needs_rework" ? "Resubmit corrected work" : "Ready to hand off?"}</h5>
            <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">This sends the task to {reviewer?.full_name || "the project reviewer"} and adds it to their Reviews queue.</p>
          </div>
          <textarea
            value={submissionNote}
            onChange={(event) => setSubmissionNote(event.target.value)}
            placeholder="Summarize what was delivered and where the evidence is"
            className="min-h-20 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <div className="flex justify-end"><Button size="sm" disabled={saving || !reviewer} onClick={handleSubmit}>{saving ? "Submitting..." : qualityTask.quality_state === "needs_rework" ? "Resubmit for review" : "Submit for review"}</Button></div>
        </div>
      ) : null}

      {qualityTask.quality_state === "submitted" && pendingReview && !data.permissions.canReview ? (
        <div className="flex items-start gap-3 border-t border-amber-500/15 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          <div><div className="font-semibold">Waiting for {pendingReview.reviewer.full_name}</div><div className="mt-1 text-xs opacity-80">Review due {formatDate(pendingReview.review_due_at, "MMM d, h:mm a")}</div></div>
        </div>
      ) : null}

      {data.permissions.canReview && pendingReview ? (
        <div className="space-y-5 border-t border-gray-200 bg-white px-4 py-5 dark:border-zinc-800 dark:bg-zinc-950/30">
          <div>
            <h5 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Review this delivery</h5>
            <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Choose one grade. Its score and decision are fixed and shown before you confirm.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {QUALITY_GRADES.map((grade) => {
              const gradeConfig = QUALITY_GRADE_CONFIG[grade]
              const active = selectedGrade === grade
              return (
                <button
                  key={grade}
                  type="button"
                  onClick={() => {
                    setSelectedGrade(grade)
                    if (gradeConfig.decision === "needs_rework" && findings.length === 0) setFindings([newFinding()])
                  }}
                  className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-blue-500 bg-blue-500/10" : "border-gray-200 hover:border-gray-300 dark:border-zinc-800 dark:hover:border-zinc-700"}`}
                >
                  <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{gradeConfig.label}</span><span className="text-sm font-bold text-gray-500 dark:text-zinc-300">{gradeConfig.score}</span></div>
                  <p className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-zinc-400">{gradeConfig.description}</p>
                </button>
              )
            })}
          </div>

          {needsReworkDecision ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><h6 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400">Required changes</h6><p className="mt-1 text-[11px] text-gray-400">The reason determines whether this cycle affects the assignee KPI.</p></div>
                <Button size="sm" variant="outline" onClick={() => setFindings((current) => [...current, newFinding()])}><Plus className="h-3.5 w-3.5" /> Finding</Button>
              </div>
              {findings.map((finding) => (
                <div key={finding.key} className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                  <div className="flex gap-2">
                    <select
                      value={finding.reason}
                      onChange={(event) => setFindings((current) => current.map((item) => item.key === finding.key ? { ...item, reason: event.target.value as QualityIssueReason } : item))}
                      className="h-9 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      {Object.entries(QUALITY_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <button type="button" onClick={() => setFindings((current) => current.filter((item) => item.key !== finding.key))} className="rounded-md p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-500" aria-label="Remove finding"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <textarea
                    value={finding.description}
                    onChange={(event) => setFindings((current) => current.map((item) => item.key === finding.key ? { ...item, description: event.target.value } : item))}
                    placeholder="What is wrong and what exactly must change?"
                    className="min-h-16 w-full rounded-md border border-gray-200 bg-white p-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              ))}
              <label className="block text-xs font-semibold text-gray-700 dark:text-zinc-300">Rework deadline<input type="date" min={format(new Date(), "yyyy-MM-dd")} value={reworkDueDate} onChange={(event) => setReworkDueDate(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-normal dark:border-zinc-700 dark:bg-zinc-900" /></label>
            </div>
          ) : null}

          <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Optional overall note" className="min-h-16 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />

          {selectedGrade ? (
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-3 ${needsReworkDecision ? "bg-rose-500/10" : "bg-emerald-500/10"}`}>
              <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-zinc-200">
                {needsReworkDecision ? <AlertTriangle className="h-4 w-4 text-rose-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {QUALITY_GRADE_CONFIG[selectedGrade].label} · {QUALITY_GRADE_CONFIG[selectedGrade].score} · {needsReworkDecision ? "returns to assignee" : "approves task"}
              </div>
              <Button size="sm" disabled={saving || (needsReworkDecision && (!reworkDueDate || findings.length === 0))} onClick={handleReview}>{saving ? "Saving..." : "Confirm review"}</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {qualityTask.quality_state === "needs_rework" && latestReviewed ? (
        <div className="space-y-3 border-t border-rose-500/15 bg-rose-500/5 px-4 py-4">
          <div className="flex items-start gap-3"><RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" /><div><div className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{latestReviewed.grade ? QUALITY_GRADE_CONFIG[latestReviewed.grade].label : "Needs rework"}</div><div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Correct the findings by {formatDate(qualityTask.rework_due_date)} and resubmit from this panel.</div></div></div>
          {latestReviewed.issues.map((issue) => <div key={issue.id} className="rounded-lg border border-rose-500/15 bg-white px-3 py-2.5 text-sm dark:bg-zinc-950/40"><div className="text-[10px] font-semibold uppercase tracking-wider text-rose-500">{QUALITY_REASON_LABELS[issue.reason]}</div><p className="mt-1 text-gray-700 dark:text-zinc-300">{issue.description}</p></div>)}
        </div>
      ) : null}

      {qualityTask.quality_reviews.some((review) => review.status !== "pending") ? (
        <div className="space-y-2 border-t border-gray-200 px-4 py-4 dark:border-zinc-800">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400">Review history</h5>
          {qualityTask.quality_reviews.filter((review) => review.status !== "pending").map((review) => (
            <div key={review.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-950/40">
              <div className="flex items-center gap-2"><span className="font-semibold text-gray-800 dark:text-zinc-200">Cycle {review.cycle_number}</span><span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold dark:bg-zinc-800">{review.grade ? QUALITY_GRADE_CONFIG[review.grade].label : review.status.replace(/_/g, " ")}</span>{!review.affects_score && review.status === "needs_rework" ? <span className="text-gray-400">No KPI impact</span> : null}</div>
              <span className="text-gray-400">{formatDate(review.reviewed_at, "MMM d")}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
