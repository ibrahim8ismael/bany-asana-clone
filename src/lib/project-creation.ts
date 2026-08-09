export const DEFAULT_PROJECT_SECTION = {
  name: "General",
  position: 1000,
} as const

export function buildProjectCreateData(input: {
  name: string
  description?: string
  deadline: Date | null
  defaultView: string
  workspaceId: string
  clientId: string
  ownerId: string
  color?: string
}) {
  return {
    name: input.name.trim(),
    description: input.description || "",
    deadline: input.deadline,
    status: "incomplete",
    default_view: input.defaultView,
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    owner_id: input.ownerId,
    icon: "project",
    color: input.color || "#6366f1",
    privacy: "workspace_visible",
    members: {
      create: {
        user_id: input.ownerId,
        role: "owner",
      },
    },
  } as const
}
