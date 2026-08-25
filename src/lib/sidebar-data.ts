import type { Prisma } from "@prisma/client"
import { projectAccessWhere } from "@/lib/permissions"

export function sidebarProjectWhere(userId: string, isSuperAdmin: boolean): Prisma.ProjectWhereInput {
  return {
    ...projectAccessWhere(userId, "view", isSuperAdmin),
    archived: false,
  }
}
