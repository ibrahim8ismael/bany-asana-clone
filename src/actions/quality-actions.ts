"use server"

import { addBusinessDays, startOfDay } from "date-fns"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { authOptions } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"
import {
  canAccessWorkspace,
  getAccessibleProjectContext,
  getAccessibleTaskContext,
} from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { deriveProjectCompletionStatus } from "@/lib/workflow"
import {
  calculateGradeKpiScore,
  buildQualityDecisionTaskUpdate,
  issueAffectsQualityScore,
  QUALITY_GRADE_CONFIG,
  QUALITY_GRADES,
  QUALITY_ISSUE_REASONS,
  type QualityGrade,
  type QualityIssueReason,
} from "@/lib/quality"

type GradeReviewInput = {
  grade: QualityGrade
  findings?: Array<{ reason: QualityIssueReason; description: string }>
  reviewNote?: string
  reworkDueDate?: string | null
}

const PROJECT_QUALITY_POLICIES = ["off", "optional", "required"] as const
type ProjectQualityPolicy = (typeof PROJECT_QUALITY_POLICIES)[number]

async function getSessionUserId() {
  const session = await getServerSession(authOptions)
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error"
}

function parseDateOnly(value?: string | null) {
  if (!value) return null
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function canReviewQualityTask(userId: string, task: { reviewer_id: string | null; project_id: string | null; workspace_id: string }) {
  if (task.reviewer_id === userId) return true
  if (task.project_id && await getAccessibleProjectContext(userId, task.project_id, "manage")) return true
  return canAccessWorkspace(userId, task.workspace_id, "admin")
}

async function canAssignTaskReviewer(userId: string, task: {
  creator_id: string
  reviewer_id: string | null
  project_id: string | null
  workspace_id: string
}) {
  if (task.creator_id === userId || task.reviewer_id === userId) return true
  if (task.project_id && await getAccessibleProjectContext(userId, task.project_id, "manage")) return true
  return canAccessWorkspace(userId, task.workspace_id, "admin")
}

function effectiveTaskPolicy(task: {
  quality_policy_override: string | null
  quality_required: boolean
  quality_state: string
  project: { quality_policy: string } | null
}): ProjectQualityPolicy {
  if (task.quality_state !== "not_required" || task.quality_required) return "required"
  const policy = task.quality_policy_override || task.project?.quality_policy || "off"
  return PROJECT_QUALITY_POLICIES.includes(policy as ProjectQualityPolicy) ? policy as ProjectQualityPolicy : "off"
}

async function eligibleReviewer(userId: string, workspaceId: string) {
  if (!userId) return null
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
    select: { role: true, user: { select: USER_PUBLIC_SELECT } },
  })
  return membership && membership.role !== "guest" ? membership.user : null
}

async function resolveReviewer(task: {
  workspace_id: string
  assignee_id: string | null
  creator_id: string
  reviewer_id: string | null
  project: { default_reviewer_id: string | null } | null
}) {
  const submitterId = task.assignee_id || task.creator_id
  const candidates = [task.reviewer_id, task.creator_id, task.project?.default_reviewer_id]

  for (const candidateId of [...new Set(candidates.filter(Boolean))] as string[]) {
    if (candidateId === submitterId) continue
    const reviewer = await eligibleReviewer(candidateId, task.workspace_id)
    if (reviewer) return reviewer
  }

  return null
}

function revalidateQualityPaths(task: { project_id: string | null; client_id: string | null }) {
  revalidatePath("/my-tasks")
  revalidatePath("/home")
  revalidatePath("/clients")
  revalidatePath("/reporting")
  revalidatePath("/inbox")
  revalidatePath("/(dashboard)", "layout")

  if (task.project_id) {
    revalidatePath(`/projects/${task.project_id}/list`)
    revalidatePath(`/projects/${task.project_id}/board`)
    revalidatePath(`/projects/${task.project_id}/calendar`)
    revalidatePath(`/projects/${task.project_id}/timeline`)
    revalidatePath(`/projects/${task.project_id}/overview`)
  }
}

async function notifyUser({
  userId,
  actorId,
  title,
  body,
  taskId,
}: {
  userId: string | null
  actorId: string
  title: string
  body: string
  taskId: string
}) {
  if (!userId || userId === actorId) return
  await prisma.notification.create({
    data: {
      user_id: userId,
      type: "quality_review",
      title,
      body,
      related_entity_type: "task",
      related_entity_id: taskId,
    },
  })
}

async function syncProjectCompletion(projectId: string | null, actorId: string) {
  if (!projectId) return
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      workspace_id: true,
      status: true,
      tasks: { where: { archived: false }, select: { status: true } },
    },
  })
  if (!project) return

  const nextStatus = deriveProjectCompletionStatus(
    project.status,
    project.tasks.map((task) => task.status)
  )
  if (nextStatus === project.status) return

  await prisma.project.update({ where: { id: project.id }, data: { status: nextStatus } })
  await logActivity({
    workspaceId: project.workspace_id,
    actorId,
    entityType: "project",
    entityId: project.id,
    action: "project_status_changed",
    meta: { source: "automatic", from: project.status, to: nextStatus },
  })
}

async function loadTaskQuality(taskId: string, userId: string) {
  const access = await getAccessibleTaskContext(userId, taskId, "view")
  if (!access) return null

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      status: true,
      workspace_id: true,
      project_id: true,
      client_id: true,
      assignee_id: true,
      creator_id: true,
      due_date: true,
      completed_at: true,
      quality_required: true,
      quality_policy_override: true,
      quality_state: true,
      reviewer_id: true,
      first_submitted_at: true,
      original_due_date: true,
      rework_due_date: true,
      approved_at: true,
      quality_score: true,
      first_quality_grade: true,
      final_quality_grade: true,
      review_cycle_count: true,
      rework_count: true,
      quality_blocker_count: true,
      assignee: { select: USER_PUBLIC_SELECT },
      creator: { select: USER_PUBLIC_SELECT },
      reviewer: { select: USER_PUBLIC_SELECT },
      project: {
        select: {
          id: true,
          name: true,
          quality_policy: true,
          default_reviewer_id: true,
          review_sla_days: true,
        },
      },
      quality_reviews: {
        orderBy: { cycle_number: "desc" },
        include: {
          submitter: { select: USER_PUBLIC_SELECT },
          reviewer: { select: USER_PUBLIC_SELECT },
          issues: { orderBy: { created_at: "asc" } },
        },
      },
    },
  })
  if (!task) return null

  const [canReview, canAssign, suggestedReviewer] = await Promise.all([
    canReviewQualityTask(userId, task),
    canAssignTaskReviewer(userId, task),
    resolveReviewer(task),
  ])
  const submitterId = task.assignee_id || task.creator_id
  const policy = effectiveTaskPolicy(task)

  return {
    task,
    suggestedReviewer,
    effectivePolicy: policy,
    permissions: {
      isSubmitter: userId === submitterId,
      canAssignReviewer: canAssign && !task.quality_state.startsWith("approved"),
      canSubmit: userId === submitterId
        && policy !== "off"
        && ["not_required", "ready", "needs_rework"].includes(task.quality_state)
        && task.status !== "complete",
      canReview: canReview && task.quality_state === "submitted",
    },
  }
}

export async function getTaskQuality(taskId: string) {
  const userId = await getSessionUserId()
  if (!userId) return { error: "Unauthorized" }
  const data = await loadTaskQuality(taskId, userId)
  return data ? { success: true, ...data } : { error: "Not found" }
}

export async function assignTaskReviewer(taskId: string, reviewerId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }
    const access = await getAccessibleTaskContext(userId, taskId, "view")
    if (!access) return { error: "Not found" }

    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) return { error: "Not found" }
    if (!await canAssignTaskReviewer(userId, task)) return { error: "You cannot reassign this review" }
    if (task.quality_state.startsWith("approved")) return { error: "Approved reviews cannot be reassigned" }
    if (reviewerId === (task.assignee_id || task.creator_id)) return { error: "The assignee cannot review their own work" }
    if (!await eligibleReviewer(reviewerId, task.workspace_id)) return { error: "Reviewer must be an active workspace member" }

    const previousReviewerId = task.reviewer_id
    await prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: task.id }, data: { reviewer_id: reviewerId } })
      if (task.quality_state === "submitted") {
        const pendingReview = await tx.taskQualityReview.findFirst({
          where: { task_id: task.id, status: "pending" },
          orderBy: { cycle_number: "desc" },
        })
        if (pendingReview) {
          await tx.taskQualityReview.update({ where: { id: pendingReview.id }, data: { reviewer_id: reviewerId } })
        }
      }
    })

    await notifyUser({
      userId: reviewerId,
      actorId: userId,
      title: "Quality review assigned to you",
      body: `${task.title} is now in your review queue.`,
      taskId: task.id,
    })
    if (previousReviewerId && previousReviewerId !== reviewerId) {
      await notifyUser({
        userId: previousReviewerId,
        actorId: userId,
        title: "Quality review reassigned",
        body: `${task.title} was removed from your review queue.`,
        taskId: task.id,
      })
    }
    await logActivity({
      workspaceId: task.workspace_id,
      actorId: userId,
      entityType: "task",
      entityId: task.id,
      action: "quality_reviewer_changed",
      meta: { source: "manual", from: previousReviewerId, to: reviewerId },
    })

    revalidateQualityPaths(task)
    const data = await loadTaskQuality(taskId, userId)
    return data ? { success: true, ...data, taskUpdate: { reviewer_id: reviewerId } } : { error: "Not found" }
  } catch (error) {
    console.error("Failed to assign quality reviewer:", error)
    return { error: getErrorMessage(error) }
  }
}

export async function submitTaskForReview(taskId: string, input: { submissionNote?: string }) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }
    const access = await getAccessibleTaskContext(userId, taskId, "view")
    if (!access) return { error: "Not found" }
    if (access.parent_task_id) return { error: "Quality review is available for top-level tasks only" }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { select: { quality_policy: true, default_reviewer_id: true, review_sla_days: true } } },
    })
    if (!task) return { error: "Not found" }
    const submitterId = task.assignee_id || task.creator_id
    if (submitterId !== userId) return { error: "Only the assignee can submit this task" }
    if (effectiveTaskPolicy(task) === "off") return { error: "Quality review is off for this task" }
    if (!["not_required", "ready", "needs_rework"].includes(task.quality_state)) return { error: "Task is not ready to submit" }

    const reviewer = await resolveReviewer(task)
    if (!reviewer) return { error: "No independent reviewer is available. Ask a project admin to set the default reviewer." }

    const submissionNote = input.submissionNote?.trim() || null
    if (submissionNote && submissionNote.length > 2_000) return { error: "Submission note is too long" }

    const now = new Date()
    const cycleNumber = task.review_cycle_count + 1
    const slaDays = Math.min(Math.max(task.project?.review_sla_days || 1, 1), 30)
    const reviewDueAt = addBusinessDays(now, slaDays)

    await prisma.$transaction(async (tx) => {
      await tx.taskQualityReview.create({
        data: {
          task_id: task.id,
          cycle_number: cycleNumber,
          submission_note: submissionNote,
          submitted_by_id: userId,
          submitted_at: now,
          review_due_at: reviewDueAt,
          reviewer_id: reviewer.id,
        },
      })
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: "submitted_for_review",
          quality_required: true,
          quality_state: "submitted",
          reviewer_id: reviewer.id,
          first_submitted_at: task.first_submitted_at || now,
          original_due_date: task.first_submitted_at ? task.original_due_date : task.due_date,
          rework_due_date: null,
          completed_at: null,
          review_cycle_count: { increment: 1 },
        },
      })
    })

    await syncProjectCompletion(task.project_id, userId)
    await logActivity({
      workspaceId: task.workspace_id,
      actorId: userId,
      entityType: "task",
      entityId: task.id,
      action: cycleNumber === 1 ? "quality_submitted" : "quality_resubmitted",
      meta: { source: "manual", cycleNumber, reviewerId: reviewer.id, reviewDueAt: reviewDueAt.toISOString() },
    })
    await notifyUser({
      userId: reviewer.id,
      actorId: userId,
      title: "Review required",
      body: `${task.title} is ready for your review by ${reviewDueAt.toLocaleDateString()}.`,
      taskId: task.id,
    })

    revalidateQualityPaths(task)
    const data = await loadTaskQuality(taskId, userId)
    return data ? {
      success: true,
      ...data,
      taskUpdate: {
        status: "submitted_for_review",
        quality_required: true,
        quality_state: "submitted",
        reviewer_id: reviewer.id,
        first_submitted_at: task.first_submitted_at || now,
        rework_due_date: null,
      },
    } : { error: "Not found" }
  } catch (error) {
    console.error("Failed to submit task for quality review:", error)
    return { error: getErrorMessage(error) }
  }
}

export async function reviewTaskQualityGrade(taskId: string, input: GradeReviewInput) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }
    const access = await getAccessibleTaskContext(userId, taskId, "view")
    if (!access) return { error: "Not found" }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { quality_reviews: { where: { status: "pending" }, orderBy: { cycle_number: "desc" }, take: 1 } },
    })
    if (!task) return { error: "Not found" }
    if (!await canReviewQualityTask(userId, task)) return { error: "Only the assigned reviewer or a project admin can review this task" }
    if (task.quality_state !== "submitted" || task.quality_reviews.length !== 1) return { error: "There is no pending review" }
    if (!QUALITY_GRADES.includes(input.grade)) return { error: "Choose a valid quality grade" }

    const gradeConfig = QUALITY_GRADE_CONFIG[input.grade]
    const needsRework = gradeConfig.decision === "needs_rework"
    const findings = (input.findings || []).map((finding) => ({ ...finding, description: finding.description.trim() }))
    const findingsValid = findings.every((finding) =>
      QUALITY_ISSUE_REASONS.includes(finding.reason)
      && finding.description.length > 0
      && finding.description.length <= 1_000
    )
    if (!findingsValid) return { error: "Complete the reason and description for every finding" }
    if (needsRework && findings.length === 0) return { error: "Add at least one finding that explains the required change" }

    const reworkDueDate = parseDateOnly(input.reworkDueDate)
    if (needsRework && !reworkDueDate) return { error: "Set a rework deadline" }
    if (reworkDueDate && reworkDueDate < startOfDay(new Date())) return { error: "Rework deadline cannot be in the past" }

    const reviewNote = input.reviewNote?.trim() || null
    if (reviewNote && reviewNote.length > 2_000) return { error: "Review note is too long" }

    const affectsScore = needsRework && findings.some((finding) => issueAffectsQualityScore(finding.reason))
    const nextReworkCount = task.rework_count + (affectsScore ? 1 : 0)
    const firstAccountableGrade = task.first_quality_grade as QualityGrade | null
      || (!needsRework || affectsScore ? input.grade : null)
    const taskKpiScore = firstAccountableGrade
      ? calculateGradeKpiScore(firstAccountableGrade, nextReworkCount)
      : null
    const nextBlockerCount = task.quality_blocker_count + (input.grade === "major_rework" && affectsScore ? 1 : 0)
    const outcome = gradeConfig.decision
    const now = new Date()
    const review = task.quality_reviews[0]
    const taskDecisionUpdate = buildQualityDecisionTaskUpdate({
      outcome,
      now,
      reworkDueDate,
      firstAccountableGrade,
      finalGrade: input.grade,
      qualityScore: taskKpiScore,
      reworkCount: nextReworkCount,
      blockerCount: nextBlockerCount,
    })

    await prisma.$transaction(async (tx) => {
      await tx.taskQualityReview.update({
        where: { id: review.id },
        data: {
          status: outcome,
          grade: input.grade,
          score: gradeConfig.score,
          decision: needsRework ? "request_changes" : "approve",
          reviewer_id: userId,
          reviewed_at: now,
          review_note: reviewNote,
          rework_due_date: needsRework ? reworkDueDate : null,
          affects_score: affectsScore,
          issues: {
            create: findings.map((finding) => ({
              reason: finding.reason,
              description: finding.description,
              severity: input.grade === "major_rework" ? "blocker" : needsRework ? "major" : "minor",
            })),
          },
        },
      })
      await tx.task.update({
        where: { id: task.id },
        data: taskDecisionUpdate,
      })
    })

    await syncProjectCompletion(task.project_id, userId)
    await logActivity({
      workspaceId: task.workspace_id,
      actorId: userId,
      entityType: "task",
      entityId: task.id,
      action: needsRework ? "quality_rework_requested" : "quality_approved",
      meta: {
        source: "manual",
        cycleNumber: review.cycle_number,
        grade: input.grade,
        gradeScore: gradeConfig.score,
        qualityScore: taskKpiScore,
        affectsScore,
        reworkDueDate: reworkDueDate?.toISOString() || null,
      },
    })
    await notifyUser({
      userId: task.assignee_id || task.creator_id,
      actorId: userId,
      title: needsRework ? gradeConfig.label : `Approved · ${gradeConfig.label}`,
      body: needsRework
        ? `${task.title} needs changes before it can be completed.`
        : `${task.title} was approved with a ${gradeConfig.label} grade.`,
      taskId: task.id,
    })

    if (needsRework && nextReworkCount >= 2) {
      const ownerId = task.project_id
        ? (await prisma.project.findUnique({ where: { id: task.project_id }, select: { owner_id: true } }))?.owner_id || null
        : (await prisma.workspace.findUnique({ where: { id: task.workspace_id }, select: { owner_id: true } }))?.owner_id || null
      await notifyUser({
        userId: ownerId,
        actorId: userId,
        title: "Repeated quality rework needs attention",
        body: `${task.title} has reached ${nextReworkCount} scored rework cycles.`,
        taskId: task.id,
      })
    }

    revalidateQualityPaths(task)
    const data = await loadTaskQuality(taskId, userId)
    return data ? {
      success: true,
      ...data,
      taskUpdate: {
        status: needsRework ? "needs_rework" : "complete",
        quality_state: outcome,
        quality_score: taskKpiScore,
        first_quality_grade: firstAccountableGrade,
        final_quality_grade: needsRework ? null : input.grade,
        rework_due_date: needsRework ? reworkDueDate : null,
        completed_at: needsRework ? null : now,
        approved_at: needsRework ? null : now,
        rework_count: nextReworkCount,
        quality_blocker_count: nextBlockerCount,
      },
    } : { error: "Not found" }
  } catch (error) {
    console.error("Failed to review task quality grade:", error)
    return { error: getErrorMessage(error) }
  }
}

export async function getProjectQualitySettings(projectId: string) {
  const userId = await getSessionUserId()
  if (!userId) return { error: "Unauthorized" }
  const projectAccess = await getAccessibleProjectContext(userId, projectId, "view")
  if (!projectAccess) return { error: "Not found" }

  const [project, canManage, memberships] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        quality_policy: true,
        default_reviewer_id: true,
        review_sla_days: true,
        default_reviewer: { select: USER_PUBLIC_SELECT },
      },
    }),
    getAccessibleProjectContext(userId, projectId, "manage"),
    prisma.workspaceMember.findMany({
      where: { workspace_id: projectAccess.workspace_id, role: { not: "guest" } },
      select: { user: { select: USER_PUBLIC_SELECT } },
      orderBy: { joined_at: "asc" },
    }),
  ])
  if (!project) return { error: "Not found" }

  return {
    success: true,
    settings: project,
    canManage: Boolean(canManage),
    reviewerOptions: memberships.map((membership) => membership.user),
  }
}

export async function updateProjectQualitySettings(projectId: string, input: {
  policy: ProjectQualityPolicy
  defaultReviewerId?: string | null
  reviewSlaDays: number
}) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }
    const project = await getAccessibleProjectContext(userId, projectId, "manage")
    if (!project) return { error: "Not found" }
    if (!PROJECT_QUALITY_POLICIES.includes(input.policy)) return { error: "Invalid quality policy" }
    if (!Number.isInteger(input.reviewSlaDays) || input.reviewSlaDays < 1 || input.reviewSlaDays > 30) {
      return { error: "Review SLA must be between 1 and 30 business days" }
    }
    if (input.policy === "required" && !input.defaultReviewerId) {
      return { error: "Required review needs a default reviewer for tasks created by their assignee" }
    }
    if (input.defaultReviewerId && !await eligibleReviewer(input.defaultReviewerId, project.workspace_id)) {
      return { error: "Default reviewer must be an active workspace member" }
    }

    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: project.id },
        data: {
          quality_policy: input.policy,
          default_reviewer_id: input.defaultReviewerId || null,
          review_sla_days: input.reviewSlaDays,
        },
      })
      await tx.task.updateMany({
        where: { project_id: project.id, parent_task_id: null, first_submitted_at: null, archived: false, status: { not: "complete" } },
        data: input.policy === "required"
          ? { quality_required: true, quality_state: "ready" }
          : { quality_required: false, quality_state: "not_required" },
      })
    })

    await logActivity({
      workspaceId: project.workspace_id,
      actorId: userId,
      entityType: "project",
      entityId: project.id,
      action: "project_quality_policy_changed",
      meta: { policy: input.policy, defaultReviewerId: input.defaultReviewerId || null, reviewSlaDays: input.reviewSlaDays },
    })
    revalidatePath(`/projects/${project.id}/overview`)
    revalidatePath("/clients")
    revalidatePath("/my-tasks")
    revalidatePath("/(dashboard)", "layout")
    return { success: true }
  } catch (error) {
    console.error("Failed to update project quality settings:", error)
    return { error: getErrorMessage(error) }
  }
}
