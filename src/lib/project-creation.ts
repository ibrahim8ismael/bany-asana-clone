import type { ProjectMemberAssignment } from "@/lib/project-membership"

export const DEFAULT_PROJECT_SECTIONS = [
  { name: "Backlog", position: 1000 },
  { name: "To Do", position: 2000 },
  { name: "In Progress", position: 3000 },
  { name: "In Review", position: 4000 },
  { name: "Needs Rework", position: 5000 },
  { name: "Done", position: 6000 },
] as const

export function buildProjectCreateData(input: {
  name: string
  description?: string
  deadline: Date | null
  defaultView: string
  workspaceId: string
  clientId: string
  ownerId: string
  color?: string
  members?: ProjectMemberAssignment[]
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
      create: [
        {
          user_id: input.ownerId,
          role: "admin",
        },
        ...(input.members || []).map((member) => ({
          user_id: member.userId,
          role: member.role,
        })),
      ],
    },
  }
}
