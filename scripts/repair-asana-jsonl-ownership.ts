#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client"
import { getJsonlImportActorIdentity } from "../src/lib/asana-import-identity"

const prisma = new PrismaClient()

async function main() {
  const importedWorkspaces = await prisma.importRun.findMany({
    where: { source: "asana_jsonl_bundle" },
    distinct: ["workspace_id"],
    select: { workspace_id: true },
  })

  if (importedWorkspaces.length === 0) {
    console.log("No Asana JSONL import runs found; no data repair is required.")
    return
  }

  for (const { workspace_id: workspaceId } of importedWorkspaces) {
    const actor = getJsonlImportActorIdentity(workspaceId)

    const repaired = await prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { id: actor.id },
        create: {
          id: actor.id,
          full_name: actor.fullName,
          email: actor.email,
          password_hash: null,
          is_super_admin: false,
          active_workspace_id: workspaceId,
        },
        update: {
          full_name: actor.fullName,
          email: actor.email,
          password_hash: null,
          is_super_admin: false,
          active_workspace_id: workspaceId,
        },
      })

      await tx.workspaceMember.upsert({
        where: {
          workspace_id_user_id: {
            workspace_id: workspaceId,
            user_id: actor.id,
          },
        },
        create: {
          workspace_id: workspaceId,
          user_id: actor.id,
          role: "member",
        },
        update: { role: "member" },
      })

      return tx.task.updateMany({
        where: {
          workspace_id: workspaceId,
          id: { startsWith: "mig_task_" },
        },
        data: { creator_id: actor.id },
      })
    })

    console.log(
      JSON.stringify({
        workspaceId,
        importActorId: actor.id,
        repairedTasks: repaired.count,
      })
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
