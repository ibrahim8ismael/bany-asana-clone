import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * Normalize the legacy RBAC vocabulary without granting cross-workspace access.
 *
 * WorkspaceMember.role becomes owner/admin/member. Project ownership remains in
 * Project.owner_id; the owner's ProjectMember row is stored as admin so the
 * project access predicate remains complete for every owner.
 */
async function main() {
  await prisma.$transaction(async (tx) => {
    // Serialize concurrent normalization runs while keeping the rewrite atomic.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(280817, 2)`
    await tx.$executeRaw`ALTER TABLE "WorkspaceMember" DROP CONSTRAINT IF EXISTS "WorkspaceMember_role_check"`
    await tx.$executeRaw`ALTER TABLE "ProjectMember" DROP CONSTRAINT IF EXISTS "ProjectMember_role_check"`

    await tx.$executeRaw`
      UPDATE "WorkspaceMember"
      SET role = CASE
        WHEN role = 'owner' THEN 'owner'
        WHEN role = 'admin' THEN 'admin'
        ELSE 'member'
      END
    `

    const workspaces = await tx.workspace.findMany({
      select: { id: true, owner_id: true },
      orderBy: { id: "asc" },
    })

    for (const workspace of workspaces) {
      let ownerId = workspace.owner_id
      const ownerUser = await tx.user.findUnique({ where: { id: ownerId }, select: { id: true } })
      const ownerMembership = ownerUser
        ? await tx.workspaceMember.findUnique({
            where: { workspace_id_user_id: { workspace_id: workspace.id, user_id: ownerId } },
            select: { id: true },
          })
        : null

      if (!ownerUser || !ownerMembership) {
        const fallback = await tx.workspaceMember.findFirst({
          where: { workspace_id: workspace.id },
          orderBy: [{ joined_at: "asc" }, { id: "asc" }],
          select: { user_id: true },
        })
        if (!fallback) throw new Error(`Workspace ${workspace.id} has no eligible owner`)
        ownerId = fallback.user_id
        await tx.workspace.update({ where: { id: workspace.id }, data: { owner_id: ownerId } })
      }

      await tx.workspaceMember.updateMany({
        where: { workspace_id: workspace.id, role: "owner", user_id: { not: ownerId } },
        data: { role: "member" },
      })
      await tx.workspaceMember.upsert({
        where: { workspace_id_user_id: { workspace_id: workspace.id, user_id: ownerId } },
        create: { workspace_id: workspace.id, user_id: ownerId, role: "owner" },
        update: { role: "owner" },
      })
    }

    await tx.$executeRaw`
      UPDATE "ProjectMember"
      SET role = CASE
        WHEN role = 'admin' OR role = 'owner' THEN 'admin'
        ELSE 'member'
      END
    `

    await tx.$executeRaw`
      DELETE FROM "ProjectMember" AS pm
      WHERE NOT EXISTS (
        SELECT 1
        FROM "Project" AS p
        JOIN "WorkspaceMember" AS wm
          ON wm.workspace_id = p.workspace_id
         AND wm.user_id = pm.user_id
        WHERE p.id = pm.project_id
      )
    `

    const projects = await tx.project.findMany({
      select: { id: true, workspace_id: true, owner_id: true },
      orderBy: { id: "asc" },
    })

    for (const project of projects) {
      const workspaceOwner = await tx.workspace.findUnique({
        where: { id: project.workspace_id },
        select: { owner_id: true },
      })
      if (!workspaceOwner) throw new Error(`Project ${project.id} has no parent workspace`)

      const ownerMembership = await tx.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: {
            workspace_id: project.workspace_id,
            user_id: project.owner_id,
          },
        },
        select: { id: true },
      })
      const ownerId = ownerMembership ? project.owner_id : workspaceOwner.owner_id

      if (ownerId !== project.owner_id) {
        await tx.project.update({ where: { id: project.id }, data: { owner_id: ownerId } })
      }

      await tx.projectMember.upsert({
        where: { project_id_user_id: { project_id: project.id, user_id: ownerId } },
        create: { project_id: project.id, user_id: ownerId, role: "admin" },
        update: { role: "admin" },
      })
    }

    await tx.$executeRaw`
      ALTER TABLE "WorkspaceMember"
      ADD CONSTRAINT "WorkspaceMember_role_check" CHECK (role IN ('owner', 'admin', 'member'))
    `
    await tx.$executeRaw`
      ALTER TABLE "ProjectMember"
      ADD CONSTRAINT "ProjectMember_role_check" CHECK (role IN ('admin', 'member'))
    `
  })
}

main()
  .then(() => console.log("Workspace and project memberships normalized to canonical roles."))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
