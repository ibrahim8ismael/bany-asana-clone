import { getTaskWorkflowStage, type TaskWorkflowStageId } from "@/lib/workflow"

type BoardSection = {
  id: string
  name: string
}

type BoardBucket = {
  id: string
  workflowStatus: TaskWorkflowStageId | null
}

function normalizeBucketName(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
}

export function resolveBoardTaskCreationPlacement({
  bucket,
  sections,
  projectId,
  workspaceId,
}: {
  bucket: BoardBucket
  sections: readonly BoardSection[]
  projectId: string
  workspaceId: string
}) {
  const section = bucket.workflowStatus
    ? sections.find((candidate) => {
        const stage = getTaskWorkflowStage(bucket.workflowStatus!)
        const candidateName = normalizeBucketName(candidate.name)
        return candidateName === normalizeBucketName(stage.label)
          || candidateName === normalizeBucketName(stage.id)
      }) || sections[0]
    : sections.find((candidate) => candidate.id === bucket.id)

  if (!section) return { success: false as const, error: "Add a project section before creating tasks" }

  return {
    success: true as const,
    input: {
      project_id: projectId,
      section_id: section.id,
      workspace_id: workspaceId,
      status: (bucket.workflowStatus || "incomplete") as TaskWorkflowStageId,
    },
  }
}
