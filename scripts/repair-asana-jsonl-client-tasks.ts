#!/usr/bin/env tsx

import crypto from "node:crypto"
import fs from "node:fs"
import readline from "node:readline"
import { PrismaClient } from "@prisma/client"
import { deterministicMigrationId } from "../src/lib/asana-import-identity"

const prisma = new PrismaClient()

type TaskAssociation = { taskId: string; clientId: string }

function parseArgs() {
  const args = process.argv.slice(2)
  const filePath = args.find((arg) => !arg.startsWith("--")) || ""
  const workspaceIndex = args.indexOf("--workspace")
  const workspaceId = workspaceIndex >= 0 ? args[workspaceIndex + 1] || "" : ""
  const apply = args.includes("--apply")
  if (!filePath || !workspaceId) {
    throw new Error("Usage: npm run db:repair:asana-jsonl-client-tasks -- <bundle.jsonl> --workspace <id> [--apply]")
  }
  return { filePath, workspaceId, apply }
}

async function checksum(filePath: string) {
  const hash = crypto.createHash("sha256")
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk)
  return hash.digest("hex")
}

async function readAssociations(filePath: string) {
  const associations: TaskAssociation[] = []
  const input = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  })

  for await (const line of input) {
    if (!line.trim()) continue
    const record = JSON.parse(line) as Record<string, unknown>
    if (record.entity_type !== "task") continue
    const taskKey = String(record.task_import_key || "").trim()
    const projectGid = String(record.effective_primary_project_gid || "").trim()
    if (!taskKey || !projectGid) continue
    associations.push({
      taskId: deterministicMigrationId("task", taskKey),
      clientId: deterministicMigrationId("asana-client", projectGid),
    })
  }

  return associations
}

async function main() {
  const args = parseArgs()
  const sourceChecksum = await checksum(args.filePath)
  const importRun = await prisma.importRun.findFirst({
    where: { workspace_id: args.workspaceId, source: "asana_jsonl_bundle", status: "completed" },
    orderBy: { completed_at: "desc" },
    select: { id: true, summary_json: true, requested_by: true },
  })
  if (!importRun) throw new Error("No completed JSONL import exists for this workspace")

  const summary = JSON.parse(importRun.summary_json || "{}") as Record<string, unknown>
  if (summary.checksum !== sourceChecksum) {
    throw new Error("The bundle checksum does not match the completed production import")
  }

  const associations = await readAssociations(args.filePath)
  const targetClientIds = [...new Set(associations.map((row) => row.clientId))]
  const existingClients = await prisma.client.findMany({
    where: { workspace_id: args.workspaceId, id: { in: targetClientIds } },
    select: { id: true },
  })
  const existingClientIds = new Set(existingClients.map((client) => client.id))
  const safeAssociations = associations.filter((row) => existingClientIds.has(row.clientId))
  const taskIds = safeAssociations.map((row) => row.taskId)
  const existingTaskCount = await prisma.task.count({
    where: { workspace_id: args.workspaceId, id: { in: taskIds } },
  })

  const report = {
    mode: args.apply ? "apply" : "dry_run",
    workspaceId: args.workspaceId,
    sourceChecksum,
    sourceTaskAssociations: associations.length,
    validClientAssociations: safeAssociations.length,
    missingClientAssociations: associations.length - safeAssociations.length,
    existingTasks: existingTaskCount,
  }
  console.log(JSON.stringify(report, null, 2))

  if (!args.apply) return
  if (safeAssociations.length !== associations.length || existingTaskCount !== safeAssociations.length) {
    throw new Error("Association repair aborted because source clients or tasks are missing")
  }

  const assignments = new Map<string, string[]>()
  for (const row of safeAssociations) {
    assignments.set(row.clientId, [...(assignments.get(row.clientId) || []), row.taskId])
  }

  const updates = [...assignments].map(([clientId, ids]) => prisma.task.updateMany({
    where: { workspace_id: args.workspaceId, id: { in: ids } },
    data: { client_id: clientId },
  }))
  const results = await prisma.$transaction(updates)
  const updatedTasks = results.reduce((sum, result) => sum + result.count, 0)
  if (updatedTasks !== safeAssociations.length) {
    throw new Error(`Repair updated ${updatedTasks}/${safeAssociations.length} tasks`)
  }

  const repair = { ...report, updatedTasks, completedAt: new Date().toISOString() }
  await prisma.$transaction([
    prisma.importRun.update({
      where: { id: importRun.id },
      data: { summary_json: JSON.stringify({ ...summary, clientTaskAssociationRepair: repair }) },
    }),
    prisma.activityLog.create({
      data: {
        workspace_id: args.workspaceId,
        actor_id: importRun.requested_by,
        entity_type: "workspace",
        entity_id: args.workspaceId,
        action: "asana_jsonl_client_task_associations_repaired",
        meta_json: JSON.stringify(repair),
      },
    }),
  ])
  console.log(JSON.stringify({ success: true, updatedTasks }, null, 2))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
