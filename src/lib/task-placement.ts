type ProjectPlacement = {
  id: string
  workspace_id: string
  client_id: string | null
}

type ClientPlacement = {
  id: string
  workspace_id: string
}

type SectionPlacement = {
  id: string
  project_id: string | null
  user_id: string | null
  project: {
    id: string
    workspace_id: string
    client_id: string | null
  } | null
}

export type TaskPlacementResult =
  | {
      success: true
      workspaceId: string
      clientId: string | null
      projectId: string | null
      sectionId: string | null
    }
  | { success: false; error: string }

export function resolveTaskPlacement(input: {
  project: ProjectPlacement | null
  client: ClientPlacement | null
  section: SectionPlacement | null
  fallbackWorkspaceId: string | null
  requestedWorkspaceId?: string
}): TaskPlacementResult {
  const sectionProject = input.section?.project || null

  if (input.project && input.client && input.project.client_id !== input.client.id) {
    return { success: false, error: "Project does not belong to that client" }
  }

  if (input.project && input.section && input.section.project_id !== input.project.id) {
    return { success: false, error: "Section does not belong to that project" }
  }

  if (sectionProject && input.client && sectionProject.client_id !== input.client.id) {
    return { success: false, error: "Section's project does not belong to that client" }
  }

  if ((input.project || sectionProject) && input.section?.user_id) {
    return { success: false, error: "Project tasks cannot use personal sections" }
  }

  if (!input.project && !sectionProject && input.client && input.section) {
    return { success: false, error: "Direct client tasks cannot use sections" }
  }

  const projectId = input.project?.id || sectionProject?.id || null
  const clientId = input.project?.client_id ?? sectionProject?.client_id ?? input.client?.id ?? null
  const workspaceIds = [
    input.project?.workspace_id,
    sectionProject?.workspace_id,
    input.client?.workspace_id,
  ].filter(Boolean) as string[]
  const uniqueWorkspaceIds = [...new Set(workspaceIds)]

  if (uniqueWorkspaceIds.length > 1) {
    return { success: false, error: "Task relationships must belong to the same workspace" }
  }

  const workspaceId = uniqueWorkspaceIds[0] || input.fallbackWorkspaceId
  if (!workspaceId) return { success: false, error: "No workspace found" }
  if (input.requestedWorkspaceId && input.requestedWorkspaceId !== workspaceId) {
    return { success: false, error: "Workspace does not match task context" }
  }

  return {
    success: true,
    workspaceId,
    clientId,
    projectId,
    sectionId: input.section?.id || null,
  }
}

