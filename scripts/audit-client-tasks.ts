#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client"
import { clientTaskScopeWhere } from "../src/lib/client-task-scope"

const prisma = new PrismaClient()

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || "" : ""
}

async function main() {
  const clientId = argument("--client-id")
  const clientName = argument("--client")
  if (!clientId && !clientName) {
    throw new Error("Usage: npm run audit:client-tasks -- --client-id <id> OR --client <exact name>")
  }

  const matches = await prisma.client.findMany({
    where: clientId ? { id: clientId } : { name: { equals: clientName, mode: "insensitive" } },
    select: { id: true, name: true, workspace_id: true, archived: true },
  })
  if (matches.length !== 1) {
    console.log(JSON.stringify({ matches }, null, 2))
    throw new Error(matches.length ? "Client name is ambiguous; use --client-id" : "Client not found")
  }

  const client = matches[0]
  const canonical = clientTaskScopeWhere({
    clientId: client.id,
    workspaceId: client.workspace_id,
    topLevelOnly: false,
  })
  const [direct, primaryProject, linked, active, archived, topLevel, imported, validAssignee, unresolvedAssignee, detachedImported, samples, detachedSamples] = await Promise.all([
    prisma.task.count({ where: { workspace_id: client.workspace_id, client_id: client.id } }),
    prisma.task.count({ where: { workspace_id: client.workspace_id, project: { client_id: client.id } } }),
    prisma.task.count({ where: { workspace_id: client.workspace_id, task_links: { some: { project: { client_id: client.id } } } } }),
    prisma.task.count({ where: { AND: [canonical, { archived: false }] } }),
    prisma.task.count({ where: { AND: [canonical, { archived: true }] } }),
    prisma.task.count({ where: { AND: [canonical, { parent_task_id: null }] } }),
    prisma.task.count({ where: { AND: [canonical, { id: { startsWith: "mig_" } }] } }),
    prisma.task.count({ where: { AND: [canonical, { assignee_id: { not: null } }] } }),
    prisma.task.count({ where: { AND: [canonical, { assignee_id: null }] } }),
    prisma.task.count({
      where: {
        workspace_id: client.workspace_id,
        id: { startsWith: "mig_task_" },
        client_id: null,
        project_id: null,
        task_links: { none: {} },
      },
    }),
    prisma.task.findMany({
      where: canonical,
      take: 5,
      orderBy: [{ updated_at: "desc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        archived: true,
        status: true,
        client_id: true,
        project_id: true,
        section_id: true,
        assignee_id: true,
        creator_id: true,
        assignee: { select: { id: true, full_name: true } },
        task_links: { select: { project_id: true }, take: 3 },
      },
    }),
    prisma.task.findMany({
      where: {
        workspace_id: client.workspace_id,
        id: { startsWith: "mig_task_" },
        client_id: null,
        project_id: null,
        task_links: { none: {} },
      },
      take: 3,
      orderBy: [{ updated_at: "desc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        archived: true,
        status: true,
        client_id: true,
        project_id: true,
        section_id: true,
        assignee_id: true,
        creator_id: true,
        assignee: { select: { id: true, full_name: true } },
      },
    }),
  ])

  console.log(JSON.stringify({
    client,
    membership: { direct, primaryProject, linked, canonicalTotal: active + archived, active, archived, topLevel },
    import: { importedInClient: imported, detachedImportedInWorkspace: detachedImported, detachedSamples },
    assignees: { mapped: validAssignee, unassignedOrUnresolved: unresolvedAssignee },
    samples,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
