/** Canonical workspace membership roles. */
export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

/** Stored project-member roles. Ownership is authoritative in Project.owner_id. */
export const PROJECT_MEMBER_ROLES = ["admin", "member"] as const
export type ProjectRole = (typeof PROJECT_MEMBER_ROLES)[number]

export type ProjectMemberAssignment = {
  userId: string
  role: ProjectRole
}

/** Effective role shown to users for a project. */
export const PROJECT_EFFECTIVE_ROLES = ["owner", "admin", "member"] as const
export type ProjectEffectiveRole = (typeof PROJECT_EFFECTIVE_ROLES)[number]

export function isWorkspaceRole(role: unknown): role is WorkspaceRole {
  return typeof role === "string" && WORKSPACE_ROLES.includes(role as WorkspaceRole)
}

export function isProjectRole(role: unknown): role is ProjectRole {
  return typeof role === "string" && PROJECT_MEMBER_ROLES.includes(role as ProjectRole)
}

export function validateProjectMemberAssignments(
  value: unknown,
  ownerId?: string,
): { assignments: ProjectMemberAssignment[]; error?: undefined } | { assignments?: undefined; error: string } {
  if (value === undefined) return { assignments: [] }
  if (!Array.isArray(value)) return { error: "Project members must be a list" }
  if (value.length > 100) return { error: "Add no more than 100 project members at a time" }

  const seenUserIds = new Set<string>()
  const assignments: ProjectMemberAssignment[] = []

  for (const entry of value) {
    if (!entry || typeof entry !== "object") return { error: "Invalid project member" }

    const userId = "userId" in entry && typeof entry.userId === "string" ? entry.userId.trim() : ""
    const role = "role" in entry ? entry.role : undefined

    if (!userId || !isProjectRole(role)) return { error: "Every project member needs a valid user and role" }
    if (ownerId && userId === ownerId) return { error: "The project owner is added automatically" }
    if (seenUserIds.has(userId)) return { error: "A user can only be added to a project once" }

    seenUserIds.add(userId)
    assignments.push({ userId, role })
  }

  return { assignments }
}

export function isWorkspaceAdmin(role: string | null | undefined) {
  return role === "owner" || role === "admin"
}

export function isProjectAdmin(userId: string, ownerId: string, membershipRole: string | null | undefined) {
  return userId === ownerId || membershipRole === "admin"
}

export function effectiveProjectRole(input: {
  userId: string
  ownerId: string
  membershipRole: string | null | undefined
}): ProjectEffectiveRole | null {
  if (input.userId === input.ownerId) return "owner"
  if (input.membershipRole === "admin") return "admin"
  if (input.membershipRole === "member") return "member"
  return null
}
