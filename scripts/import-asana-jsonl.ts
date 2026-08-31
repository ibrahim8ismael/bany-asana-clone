#!/usr/bin/env tsx
/**
 * Asana JSONL Bundle Importer
 *
 * Imports clients and tasks as two completely independent datasets.
 *
 * - Source projects → standalone Client records
 * - Tasks → unassigned workspace tasks (client_id, project_id, section_id = null)
 * - No TaskProjectLink records for imported tasks
 * - Idempotent via deterministic IDs based on source keys
 *
 * Usage:
 *   npm run db:import:asana-jsonl -- ./asana_import_bundle.jsonl \
 *     --workspace <workspace-id> --owner <user-id> --apply
 *
 *   npm run db:import:asana-jsonl -- ./asana_import_bundle.jsonl \
 *     --workspace <workspace-id> --owner <user-id> --dry-run
 */

import crypto from "node:crypto"
import fs from "node:fs"
import readline from "node:readline"
import { PrismaClient, type Prisma } from "@prisma/client"
import {
  deterministicMigrationId as deterministicId,
  getJsonlImportActorIdentity,
} from "../src/lib/asana-import-identity"
import { resolveAsanaTaskClientId } from "../src/lib/asana-client-task-mapping"

const prisma = new PrismaClient()

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  filePath: string
  workspaceId: string
  ownerId: string
  dryRun: boolean
  batchSize: number
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  let filePath = ""
  let workspaceId = ""
  let ownerId = ""
  let dryRun = false
  let batchSize = 200

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--workspace" && args[i + 1]) {
      workspaceId = args[++i]
    } else if (arg === "--owner" && args[i + 1]) {
      ownerId = args[++i]
    } else if (arg === "--dry-run") {
      dryRun = true
    } else if (arg === "--apply") {
      dryRun = false
    } else if (arg === "--batch-size" && args[i + 1]) {
      batchSize = parseInt(args[++i], 10) || 200
    } else if (!arg.startsWith("--") && !filePath) {
      filePath = arg
    }
  }

  if (!filePath) {
    console.error(
      "Usage: npm run db:import:asana-jsonl -- <file.jsonl> --workspace <id> --owner <id> [--dry-run | --apply]"
    )
    process.exit(1)
  }

  return { filePath, workspaceId, ownerId, dryRun, batchSize }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

const COLORS: Record<string, string> = {
  "dark-green": "#2f8f6b",
  "dark-orange": "#c96a2b",
  "dark-pink": "#b85f8d",
  "dark-purple": "#7257b8",
  "dark-red": "#b94b4b",
  "dark-teal": "#2b8d8b",
  "light-blue": "#6aa6d9",
  "light-green": "#72b88d",
  "light-orange": "#dda15e",
  "light-pink": "#d98cb3",
  "light-purple": "#9f8fef",
  "light-teal": "#67b8b5",
  "light-yellow": "#d7b85f",
  "light-red": "#e87c7c",
  "dark-blue": "#4573b8",
  none: "#6b7280",
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim()
}

function normalizeLookup(value: string | null | undefined): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ")
}

function parseBoolean(value: string | null | undefined): boolean {
  return ["true", "1", "yes"].includes(normalizeLookup(value))
}

function parseDate(value: string | null | undefined): Date | null {
  const normalized = normalizeText(value)
  if (!normalized) return null

  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? `${normalized}T00:00:00.000Z`
      : normalized
  )

  return Number.isNaN(date.getTime()) ? null : date
}

function parseInteger(value: string | null | undefined): number | null {
  const normalized = normalizeText(value)
  if (!normalized) return null
  const parsed = parseInt(normalized, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function sourceStatus(value: string): string {
  return normalizeLookup(value) === "completed" ? "complete" : "incomplete"
}

function placeholderEmail(personImportKey: string): string {
  return `${deterministicId("person", personImportKey)}@import.invalid`
}

function fileChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256")
    const stream = fs.createReadStream(filePath)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => resolve(hash.digest("hex")))
    stream.on("error", reject)
  })
}

// ---------------------------------------------------------------------------
// Types for parsed JSONL records
// ---------------------------------------------------------------------------

interface ManifestRecord {
  entity_type: "manifest"
  format: string
  summary: {
    task_count: number
    project_count: number
    people_count: number
    section_count: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface PersonRecord {
  entity_type: "person"
  person_import_key: string
  display_name: string
  normalized_name: string
  email: string
  source_task_count: string
  account_status: string
}

interface ProjectRecord {
  entity_type: "project"
  project_gid: string
  project_name_raw: string
  project_name: string
  notes: string
  archived: string
  color: string
  created_at: string
  modified_at: string
  duplicate_name_exists: string
}

interface ProjectClientMappingRecord {
  entity_type: "project_client_mapping"
  project_gid: string
  project_name: string
  suggested_client_name: string
  is_client_project: string
  final_client_name: string
  mapping_action: string
  review_note: string
}

interface TaskRecord {
  entity_type: "task"
  task_import_key: string
  source_csv_row: string
  source_task_id_raw: string
  source_task_gid: string
  source_id_status: string
  title: string
  title_raw: string
  description: string
  created_at: string
  modified_at: string
  completed_at: string
  due_date: string
  status: string
  assignee_person_import_key: string
  assignee_display_name: string
  is_subtask: string
  parent_source_gid: string
  parent_source_name: string
  resolved_parent_task_import_key: string
  recurrence_type: string
  recurrence_frequency: string
  recurrence_days_of_week_json: string
  recurrence_original_due_date: string
  recurrence_json: string
  direct_project_count: string
  effective_project_count: string
  effective_primary_project_gid: string
  effective_primary_project_name: string
  effective_primary_section_gid: string
  effective_primary_section_name: string
  effective_project_source: string
  assignee_section_gid: string
  assignee_section_name: string
  attachment_count: string
}

interface TaskParentLinkRecord {
  entity_type: "task_parent_link"
  child_task_import_key: string
  parent_source_gid: string
  parent_source_name: string
  parent_parse_status: string
  resolved_parent_task_import_key: string
  resolution_status: string
  resolution_method: string
}

interface RecurringTaskRecord {
  entity_type: "recurring_task"
  task_import_key: string
  recurrence_type: string
  frequency: string
  days_of_week_json: string
  original_due_date: string
  raw_recurrence_json: string
}

interface AttachmentMetadataRecord {
  entity_type: "attachment_metadata"
  attachment_gid: string
  task_import_key: string
  resource_subtype: string
  source_metadata_only: string
  file_url_available: string
}

interface EndOfFileRecord {
  entity_type: "end_of_file"
  record_counts: Record<string, number>
  pre_footer_sha256: string
}

type JsonlRecord =
  | ManifestRecord
  | PersonRecord
  | ProjectRecord
  | ProjectClientMappingRecord
  | TaskRecord
  | TaskParentLinkRecord
  | RecurringTaskRecord
  | AttachmentMetadataRecord
  | EndOfFileRecord
  | { entity_type: "project_section"; [key: string]: unknown }
  | { entity_type: "task_project_membership_direct"; [key: string]: unknown }
  | { entity_type: "task_project_membership_effective"; [key: string]: unknown }

// ---------------------------------------------------------------------------
// Data collection from JSONL streaming
// ---------------------------------------------------------------------------

interface CollectedData {
  manifest: ManifestRecord | null
  people: PersonRecord[]
  projects: ProjectRecord[]
  clientMappings: Map<string, ProjectClientMappingRecord>
  tasks: TaskRecord[]
  parentLinks: TaskParentLinkRecord[]
  recurringTasks: Map<string, RecurringTaskRecord>
  attachmentMetadata: AttachmentMetadataRecord[]
  endOfFile: EndOfFileRecord | null
  counts: Record<string, number>
  sectionCount: number
  directMembershipCount: number
  effectiveMembershipCount: number
}

async function parseJsonlFile(filePath: string): Promise<CollectedData> {
  const data: CollectedData = {
    manifest: null,
    people: [],
    projects: [],
    clientMappings: new Map(),
    tasks: [],
    parentLinks: [],
    recurringTasks: new Map(),
    attachmentMetadata: [],
    endOfFile: null,
    counts: {},
    sectionCount: 0,
    directMembershipCount: 0,
    effectiveMembershipCount: 0,
  }

  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" })
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let lineNumber = 0
  for await (const line of rl) {
    lineNumber++
    const trimmed = line.trim()
    if (!trimmed) continue

    let record: JsonlRecord
    try {
      record = JSON.parse(trimmed)
    } catch {
      console.warn(`Line ${lineNumber}: invalid JSON, skipping`)
      continue
    }

    const entityType = record.entity_type
    data.counts[entityType] = (data.counts[entityType] || 0) + 1

    switch (entityType) {
      case "manifest":
        data.manifest = record as ManifestRecord
        break
      case "person":
        data.people.push(record as PersonRecord)
        break
      case "project":
        data.projects.push(record as ProjectRecord)
        break
      case "project_client_mapping": {
        const mapping = record as ProjectClientMappingRecord
        data.clientMappings.set(normalizeText(mapping.project_gid), mapping)
        break
      }
      case "task":
        data.tasks.push(record as TaskRecord)
        break
      case "task_parent_link":
        data.parentLinks.push(record as TaskParentLinkRecord)
        break
      case "recurring_task": {
        const rec = record as RecurringTaskRecord
        data.recurringTasks.set(normalizeText(rec.task_import_key), rec)
        break
      }
      case "attachment_metadata":
        data.attachmentMetadata.push(record as AttachmentMetadataRecord)
        break
      case "end_of_file":
        data.endOfFile = record as EndOfFileRecord
        break
      case "project_section":
        data.sectionCount++
        break
      case "task_project_membership_direct":
        data.directMembershipCount++
        break
      case "task_project_membership_effective":
        data.effectiveMembershipCount++
        break
    }
  }

  return data
}

// ---------------------------------------------------------------------------
// Import statistics
// ---------------------------------------------------------------------------

interface ImportStats {
  peopleCreated: number
  peopleMapped: number
  clientsCreated: number
  clientsUpdated: number
  clientsSkipped: number
  clientsFailed: number
  tasksCreated: number
  tasksUpdated: number
  tasksSkipped: number
  tasksFailed: number
  parentLinksResolved: number
  parentLinksUnresolved: number
  attachmentsSkipped: number
  previousLinksRemoved: number
  previousProjectsArchived: number
  previousProjectsDeleted: number
  warningCount: number
}

function emptyStats(): ImportStats {
  return {
    peopleCreated: 0,
    peopleMapped: 0,
    clientsCreated: 0,
    clientsUpdated: 0,
    clientsSkipped: 0,
    clientsFailed: 0,
    tasksCreated: 0,
    tasksUpdated: 0,
    tasksSkipped: 0,
    tasksFailed: 0,
    parentLinksResolved: 0,
    parentLinksUnresolved: 0,
    attachmentsSkipped: 0,
    previousLinksRemoved: 0,
    previousProjectsArchived: 0,
    previousProjectsDeleted: 0,
    warningCount: 0,
  }
}

// ---------------------------------------------------------------------------
// Preflight checks
// ---------------------------------------------------------------------------

async function preflight(args: CliArgs) {
  // 1. File readability
  if (!fs.existsSync(args.filePath)) {
    throw new Error(`JSONL file not found: ${args.filePath}`)
  }

  // 2. Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (e) {
    throw new Error(
      `Database connectivity failed: ${e instanceof Error ? e.message : "Unknown error"}`
    )
  }

  // 3. Workspace exists
  const workspace = await prisma.workspace.findUnique({
    where: { id: args.workspaceId },
    select: { id: true, name: true },
  })
  if (!workspace) {
    throw new Error(`Target workspace not found: ${args.workspaceId}`)
  }

  // 4. Owner exists and belongs to workspace
  const owner = await prisma.user.findUnique({
    where: { id: args.ownerId },
    select: { id: true, email: true, full_name: true, is_super_admin: true },
  })
  if (!owner) {
    throw new Error(`Import owner not found: ${args.ownerId}`)
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspace_id: args.workspaceId,
      user_id: args.ownerId,
      role: { in: ["owner", "admin"] },
    },
  })

  // Super admins or workspace owners can import
  const isWorkspaceOwner = await prisma.workspace.findFirst({
    where: { id: args.workspaceId, owner_id: args.ownerId },
  })

  if (!membership && !owner.is_super_admin && !isWorkspaceOwner) {
    throw new Error(
      `Import owner ${owner.email} does not have admin permissions on workspace ${args.workspaceId}`
    )
  }

  return { workspace, owner }
}

async function ensureImportActor(workspaceId: string, dryRun: boolean) {
  const actor = getJsonlImportActorIdentity(workspaceId)

  if (!dryRun) {
    await prisma.$transaction([
      prisma.user.upsert({
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
      }),
      prisma.workspaceMember.upsert({
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
      }),
    ])
  }

  return actor
}

// ---------------------------------------------------------------------------
// People import
// ---------------------------------------------------------------------------

async function importPeople(
  people: PersonRecord[],
  workspaceId: string,
  stats: ImportStats,
  issues: Array<Prisma.ImportIssueCreateManyInput>,
  importRunId: string,
  dryRun: boolean
) {
  const personMap = new Map<string, string>()

  // Load existing workspace members for matching
  const memberships = await prisma.workspaceMember.findMany({
    where: { workspace_id: workspaceId },
    select: {
      user: { select: { id: true, email: true, full_name: true } },
    },
  })
  const byEmail = new Map(
    memberships.map((m) => [normalizeLookup(m.user.email), m.user])
  )

  for (const person of people) {
    const personKey = normalizeText(person.person_import_key)
    const displayName = normalizeText(person.display_name) || "Imported team member"
    const sourceEmail = normalizeLookup(person.email)
    const stableId = deterministicId("person", personKey)

    // 1. Match by verified email
    let user = sourceEmail ? byEmail.get(sourceEmail) : undefined

    // 2. Match by existing deterministic ID (from prior import)
    if (!user) {
      user =
        (await prisma.user.findUnique({
          where: { id: stableId },
          select: { id: true, email: true, full_name: true },
        })) || undefined
    }

    if (user) {
      personMap.set(personKey, user.id)
      stats.peopleMapped++
    } else if (!dryRun) {
      // 3. Create placeholder
      user = await prisma.user.create({
        data: {
          id: stableId,
          full_name: displayName,
          email: sourceEmail || placeholderEmail(personKey),
          password_hash: null,
          active_workspace_id: workspaceId,
        },
        select: { id: true, email: true, full_name: true },
      })
      personMap.set(personKey, user.id)
      stats.peopleCreated++

      issues.push({
        import_run_id: importRunId,
        severity: "info",
        code: "PLACEHOLDER_USER_CREATED",
        source_type: "person",
        source_gid: personKey,
        message: `Created placeholder user "${displayName}" (${user.email}). Requires manual account mapping.`,
      })
    } else {
      personMap.set(personKey, stableId) // dry-run: use would-be ID
      stats.peopleCreated++
    }

    // Ensure workspace membership
    if (user && !dryRun) {
      await prisma.workspaceMember.upsert({
        where: {
          workspace_id_user_id: {
            workspace_id: workspaceId,
            user_id: user.id,
          },
        },
        create: {
          workspace_id: workspaceId,
          user_id: user.id,
          role: "member",
        },
        update: {},
      })
      byEmail.set(normalizeLookup(user.email), user)
    }
  }

  return personMap
}

// ---------------------------------------------------------------------------
// Client import (from source projects + client mappings)
// ---------------------------------------------------------------------------

async function importClients(
  projects: ProjectRecord[],
  clientMappings: Map<string, ProjectClientMappingRecord>,
  workspaceId: string,
  stats: ImportStats,
  issues: Array<Prisma.ImportIssueCreateManyInput>,
  importRunId: string,
  dryRun: boolean
): Promise<Map<string, string>> {
  const clientIdByProjectGid = new Map<string, string>()

  for (const project of projects) {
    const projectGid = normalizeText(project.project_gid)
    const mapping = clientMappings.get(projectGid)

    // Determine client name with priority
    const clientName =
      normalizeText(mapping?.final_client_name) ||
      normalizeText(mapping?.suggested_client_name) ||
      normalizeText(project.project_name) ||
      `Imported client ${projectGid}`

    // Deterministic ID based on project_gid (NOT name)
    const clientId = deterministicId("asana-client", projectGid)

    const color = COLORS[normalizeText(project.color)] || "#6b7280"
    const archived = parseBoolean(project.archived)
    const createdAt = parseDate(project.created_at) || new Date()
    const updatedAt = parseDate(project.modified_at) || createdAt

    const notes = [
      normalizeText(project.notes) || "",
      `\n\n--- Import Source ---`,
      `Source: Asana project`,
      `Project GID: ${projectGid}`,
      `Original name: ${normalizeText(project.project_name_raw)}`,
      `Imported at: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n")

    if (!dryRun) {
      try {
        const existing = await prisma.client.findUnique({
          where: { id: clientId },
          select: { id: true },
        })

        if (existing) {
          await prisma.client.update({
            where: { id: clientId },
            data: {
              name: clientName,
              notes,
              color,
              archived,
              updated_at: updatedAt,
            },
          })
          stats.clientsUpdated++
        } else {
          // Check for name collision with non-import client
          const nameCollision = await prisma.client.findFirst({
            where: {
              workspace_id: workspaceId,
              name: clientName,
              id: { not: { startsWith: "mig_" } },
            },
            select: { id: true, name: true },
          })

          if (nameCollision) {
            issues.push({
              import_run_id: importRunId,
              severity: "warning",
              code: "CLIENT_NAME_COLLISION",
              source_type: "project",
              source_gid: projectGid,
              message: `Client name "${clientName}" already exists (${nameCollision.id}) but is not source-backed. Creating separate import Client.`,
            })
            stats.warningCount++
          }

          await prisma.client.create({
            data: {
              id: clientId,
              workspace_id: workspaceId,
              name: clientName,
              notes,
              color,
              archived,
              created_at: createdAt,
              updated_at: updatedAt,
            },
          })
          stats.clientsCreated++
        }

        clientIdByProjectGid.set(projectGid, clientId)
      } catch (err) {
        stats.clientsFailed++
        issues.push({
          import_run_id: importRunId,
          severity: "error",
          code: "CLIENT_CREATE_FAILED",
          source_type: "project",
          source_gid: projectGid,
          message: `Failed to create client for project ${projectGid}: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    } else {
      clientIdByProjectGid.set(projectGid, clientId)
      stats.clientsCreated++
    }
  }

  return clientIdByProjectGid
}

// ---------------------------------------------------------------------------
// Task import — source projects are represented as direct client work.
// ---------------------------------------------------------------------------

function buildRecurrenceNote(
  task: TaskRecord,
  recurringTasks: Map<string, RecurringTaskRecord>
): string | null {
  const importKey = normalizeText(task.task_import_key)
  const recurring = recurringTasks.get(importKey)

  // Check from recurring_task records first
  if (recurring) {
    const parts = [
      `type: ${normalizeText(recurring.recurrence_type)}`,
      normalizeText(recurring.frequency)
        ? `frequency: ${normalizeText(recurring.frequency)}`
        : null,
      normalizeText(recurring.original_due_date)
        ? `original due date: ${normalizeText(recurring.original_due_date)}`
        : null,
    ].filter(Boolean)
    return `\n\n📅 Recurring schedule (migrated from Asana) — ${parts.join(", ")}`
  }

  // Fallback to inline recurrence_type on task
  const recType = normalizeText(task.recurrence_type)
  if (recType && recType !== "never") {
    const parts = [
      `type: ${recType}`,
      normalizeText(task.recurrence_frequency)
        ? `frequency: ${normalizeText(task.recurrence_frequency)}`
        : null,
      normalizeText(task.recurrence_original_due_date)
        ? `original due date: ${normalizeText(task.recurrence_original_due_date)}`
        : null,
    ].filter(Boolean)
    return `\n\n📅 Recurring schedule (migrated from Asana) — ${parts.join(", ")}`
  }

  return null
}

function buildTaskDescription(
  task: TaskRecord,
  recurringTasks: Map<string, RecurringTaskRecord>
): string | null {
  const desc = normalizeText(task.description)
  const recNote = buildRecurrenceNote(task, recurringTasks)
  if (!desc && !recNote) return null
  return [desc, recNote].filter(Boolean).join("")
}

async function importTasks(
  tasks: TaskRecord[],
  workspaceId: string,
  importActorId: string,
  personMap: Map<string, string>,
  clientIdByProjectGid: Map<string, string>,
  recurringTasks: Map<string, RecurringTaskRecord>,
  stats: ImportStats,
  issues: Array<Prisma.ImportIssueCreateManyInput>,
  importRunId: string,
  batchSize: number,
  dryRun: boolean
): Promise<Set<string>> {
  const importedTaskIds = new Set<string>()

  for (let offset = 0; offset < tasks.length; offset += batchSize) {
    const batch = tasks.slice(offset, offset + batchSize)

    if (!dryRun) {
      const upserts = batch.map((task) => {
        const importKey = normalizeText(task.task_import_key)
        const id = deterministicId("task", importKey)
        importedTaskIds.add(id)

        const status = sourceStatus(task.status)
        const createdAt = parseDate(task.created_at) || new Date()
        const updatedAt = parseDate(task.modified_at) || createdAt
        const completedAt =
          status === "complete" ? parseDate(task.completed_at) : null
        const position = (parseInteger(task.source_csv_row) || 0) * 1000
        const assigneeKey = normalizeText(task.assignee_person_import_key)
        const assigneeId = assigneeKey ? (personMap.get(assigneeKey) || null) : null
        const clientId = resolveAsanaTaskClientId(task, clientIdByProjectGid)

        const title = normalizeText(task.title) || "Imported task"
        const description = buildTaskDescription(task, recurringTasks)

        const common: Prisma.TaskUncheckedUpdateInput = {
          workspace_id: workspaceId,
          client_id: clientId,
          project_id: null,
          section_id: null,
          title,
          description_rich_text: description,
          status,
          assignee_id: assigneeId,
          creator_id: importActorId,
          due_date: parseDate(task.due_date),
          completed_at: completedAt,
          task_type: "task",
          quality_required: false,
          quality_state: "not_required",
          position,
          archived: false,
          updated_at: updatedAt,
        }

        return prisma.task.upsert({
          where: { id },
          create: {
            id,
            ...(common as Prisma.TaskUncheckedCreateInput),
            parent_task_id: null,
            created_at: createdAt,
          },
          update: common,
        })
      })

      try {
        await prisma.$transaction(upserts)
        // Count creates vs updates
        for (const task of batch) {
          const importKey = normalizeText(task.task_import_key)
          const id = deterministicId("task", importKey)
          // We'll count all as created for simplicity since upsert handles both
          stats.tasksCreated++
        }
      } catch (err) {
        // Fallback: try one by one
        for (const task of batch) {
          const importKey = normalizeText(task.task_import_key)
          const id = deterministicId("task", importKey)
          try {
            const status = sourceStatus(task.status)
            const createdAt = parseDate(task.created_at) || new Date()
            const updatedAt = parseDate(task.modified_at) || createdAt
            const completedAt =
              status === "complete" ? parseDate(task.completed_at) : null
            const position = (parseInteger(task.source_csv_row) || 0) * 1000
            const assigneeKey = normalizeText(task.assignee_person_import_key)
            const assigneeId = assigneeKey ? (personMap.get(assigneeKey) || null) : null
            const clientId = resolveAsanaTaskClientId(task, clientIdByProjectGid)
            const title = normalizeText(task.title) || "Imported task"
            const description = buildTaskDescription(task, recurringTasks)

            await prisma.task.upsert({
              where: { id },
              create: {
                id,
                workspace_id: workspaceId,
                client_id: clientId,
                project_id: null,
                section_id: null,
                parent_task_id: null,
                title,
                description_rich_text: description,
                status,
                assignee_id: assigneeId,
                creator_id: importActorId,
                due_date: parseDate(task.due_date),
                completed_at: completedAt,
                task_type: "task",
                quality_required: false,
                quality_state: "not_required",
                position,
                archived: false,
                created_at: createdAt,
                updated_at: updatedAt,
              },
              update: {
                workspace_id: workspaceId,
                client_id: clientId,
                project_id: null,
                section_id: null,
                title,
                description_rich_text: description,
                status,
                assignee_id: assigneeId,
                creator_id: importActorId,
                due_date: parseDate(task.due_date),
                completed_at: completedAt,
                task_type: "task",
                quality_required: false,
                quality_state: "not_required",
                position,
                archived: false,
                updated_at: updatedAt,
              },
            })
            importedTaskIds.add(id)
            stats.tasksCreated++
          } catch (innerErr) {
            stats.tasksFailed++
            issues.push({
              import_run_id: importRunId,
              severity: "error",
              code: "TASK_IMPORT_FAILED",
              source_type: "task",
              source_gid: importKey,
              message: `Failed to import task ${importKey}: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`,
            })
          }
        }
      }
    } else {
      for (const task of batch) {
        const importKey = normalizeText(task.task_import_key)
        const id = deterministicId("task", importKey)
        importedTaskIds.add(id)
        stats.tasksCreated++
      }
    }

    const processed = Math.min(offset + batch.length, tasks.length)
    if (processed === tasks.length || processed % 2000 < batchSize) {
      console.log(`  Tasks: ${processed}/${tasks.length}`)
    }
  }

  return importedTaskIds
}

// ---------------------------------------------------------------------------
// Parent link import. Client placement is retained from the task's effective
// source project; native Project/Section placement remains empty.
// ---------------------------------------------------------------------------

async function importParentLinks(
  parentLinks: TaskParentLinkRecord[],
  importedTaskIds: Set<string>,
  stats: ImportStats,
  issues: Array<Prisma.ImportIssueCreateManyInput>,
  importRunId: string,
  batchSize: number,
  dryRun: boolean
) {
  const resolved = parentLinks.filter(
    (link) =>
      normalizeLookup(link.resolution_status) === "resolved" &&
      normalizeText(link.resolved_parent_task_import_key)
  )
  const unresolved = parentLinks.filter(
    (link) => normalizeLookup(link.resolution_status) !== "resolved"
  )

  // Process resolved links
  for (let offset = 0; offset < resolved.length; offset += batchSize) {
    const batch = resolved.slice(offset, offset + batchSize)

    if (!dryRun) {
      const updates: Prisma.PrismaPromise<unknown>[] = []
      for (const link of batch) {
        const childKey = normalizeText(link.child_task_import_key)
        const parentKey = normalizeText(link.resolved_parent_task_import_key)
        const childId = deterministicId("task", childKey)
        const parentId = deterministicId("task", parentKey)

        if (!importedTaskIds.has(childId) || !importedTaskIds.has(parentId)) {
          stats.parentLinksUnresolved++
          issues.push({
            import_run_id: importRunId,
            severity: "warning",
            code: "PARENT_LINK_MISSING_TASK",
            source_type: "task_parent_link",
            source_gid: childKey,
            message: `Parent link for ${childKey} -> ${parentKey} could not be applied: one or both tasks missing.`,
          })
          continue
        }

        updates.push(
          prisma.task.update({
            where: { id: childId },
            data: {
              parent_task_id: parentId,
              project_id: null,
              section_id: null,
            },
          })
        )
        stats.parentLinksResolved++
      }

      if (updates.length > 0) {
        try {
          await prisma.$transaction(updates)
        } catch {
          // Fallback: one by one
          for (const update of updates) {
            try {
              await update
            } catch (err) {
              stats.parentLinksUnresolved++
            }
          }
        }
      }
    } else {
      stats.parentLinksResolved += batch.length
    }

    const processed = Math.min(offset + batch.length, resolved.length)
    if (processed === resolved.length || processed % 1000 < batchSize) {
      console.log(`  Parent links: ${processed}/${resolved.length}`)
    }
  }

  // Log unresolved
  for (const link of unresolved) {
    stats.parentLinksUnresolved++
    issues.push({
      import_run_id: importRunId,
      severity: "warning",
      code: "UNRESOLVED_PARENT",
      source_type: "task_parent_link",
      source_gid: normalizeText(link.child_task_import_key),
      message: `Parent could not be resolved for ${link.child_task_import_key} (parent GID: ${link.parent_source_gid})`,
      details_json: JSON.stringify(link),
    })
  }
}

// ---------------------------------------------------------------------------
// Cleanup previous incorrect import
// ---------------------------------------------------------------------------

async function cleanupPreviousImport(
  importedTaskIds: Set<string>,
  stats: ImportStats,
  issues: Array<Prisma.ImportIssueCreateManyInput>,
  importRunId: string,
  dryRun: boolean
) {
  if (importedTaskIds.size === 0) return

  const taskIdArray = Array.from(importedTaskIds)

  if (!dryRun) {
    // 1. Remove TaskProjectLink records for imported tasks
    const deletedLinks = await prisma.taskProjectLink.deleteMany({
      where: { task_id: { in: taskIdArray } },
    })
    stats.previousLinksRemoved = deletedLinks.count

    if (deletedLinks.count > 0) {
      issues.push({
        import_run_id: importRunId,
        severity: "info",
        code: "PREVIOUS_LINKS_REMOVED",
        source_type: "task_project_link",
        message: `Removed ${deletedLinks.count} TaskProjectLink records from imported tasks (from previous incorrect import).`,
      })
    }

    // 2. Source projects are Clients in this import mode, so only native
    // Project/Section placement is cleared. The resolved client_id is retained.
    await prisma.task.updateMany({
      where: {
        id: { in: taskIdArray },
        OR: [
          { project_id: { not: null } },
          { section_id: { not: null } },
        ],
      },
      data: {
        project_id: null,
        section_id: null,
      },
    })

    // 3. Handle old import-created Projects (mig_project_ prefix)
    const oldProjects = await prisma.project.findMany({
      where: { id: { startsWith: "mig_project_" } },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            tasks: true,
            task_links: true,
          },
        },
      },
    })

    for (const project of oldProjects) {
      // Check if the project has any non-imported tasks
      const nonImportedTaskCount = await prisma.task.count({
        where: {
          project_id: project.id,
          id: { notIn: taskIdArray },
        },
      })

      const nonImportedLinkCount = await prisma.taskProjectLink.count({
        where: {
          project_id: project.id,
          task_id: { notIn: taskIdArray },
        },
      })

      if (nonImportedTaskCount === 0 && nonImportedLinkCount === 0) {
        // Safe to delete - only import-created data
        // First delete sections
        await prisma.section.deleteMany({
          where: { project_id: project.id },
        })
        // Delete project members
        await prisma.projectMember.deleteMany({
          where: { project_id: project.id },
        })
        // Delete the project
        await prisma.project.delete({
          where: { id: project.id },
        })
        stats.previousProjectsDeleted++
      } else {
        // Archive instead
        await prisma.project.update({
          where: { id: project.id },
          data: { archived: true },
        })
        stats.previousProjectsArchived++
        issues.push({
          import_run_id: importRunId,
          severity: "warning",
          code: "OLD_PROJECT_ARCHIVED",
          source_type: "project",
          source_gid: project.id,
          message: `Old import project "${project.name}" (${project.id}) has non-imported data and was archived instead of deleted.`,
        })
      }
    }

    // 4. Handle old import-created Sections (mig_section_ prefix)
    const oldSections = await prisma.section.findMany({
      where: {
        id: { startsWith: "mig_section_" },
        project: { id: { startsWith: "mig_project_" } },
      },
      select: { id: true },
    })
    // These would have been deleted with their projects above
  } else {
    // Dry run - just count what would be affected
    const linkCount = await prisma.taskProjectLink.count({
      where: { task_id: { in: taskIdArray } },
    })
    stats.previousLinksRemoved = linkCount

    const wrongAssocCount = await prisma.task.count({
      where: {
        id: { in: taskIdArray },
        OR: [
          { project_id: { not: null } },
          { section_id: { not: null } },
        ],
      },
    })

    if (wrongAssocCount > 0) {
      issues.push({
        import_run_id: importRunId,
        severity: "info",
        code: "DRY_RUN_WOULD_CLEAN",
        message: `Would clear Project/Section placement from ${wrongAssocCount} previously imported tasks while retaining Client placement.`,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

async function validateImport(
  importedTaskIds: Set<string>,
  projectGids: string[],
  stats: ImportStats,
  issues: Array<Prisma.ImportIssueCreateManyInput>,
  importRunId: string,
  dryRun: boolean,
  expectedClientTaskCount: number,
) {
  if (dryRun) {
    console.log("\n  [DRY RUN] Skipping database validation")
    return
  }

  const taskIdArray = Array.from(importedTaskIds)

  // Task validation
  const invalidPlacementCount = await prisma.task.count({
    where: {
      id: { in: taskIdArray },
      OR: [
        { project_id: { not: null } },
        { section_id: { not: null } },
      ],
    },
  })

  const invalidLinkCount = await prisma.taskProjectLink.count({
    where: { task_id: { in: taskIdArray } },
  })

  console.log("\n=== VALIDATION RESULTS ===")
  console.log(`  Imported tasks: ${importedTaskIds.size}`)
  const clientTaskCount = await prisma.task.count({
    where: { id: { in: taskIdArray }, client_id: { not: null } },
  })
  console.log(`  Tasks with client_id != null: ${clientTaskCount} (expected ${expectedClientTaskCount})`)
  console.log(`  Tasks with project_id != null: ${await prisma.task.count({ where: { id: { in: taskIdArray }, project_id: { not: null } } })}`)
  console.log(`  Tasks with section_id != null: ${await prisma.task.count({ where: { id: { in: taskIdArray }, section_id: { not: null } } })}`)
  console.log(`  TaskProjectLink records for imported tasks: ${invalidLinkCount}`)

  if (invalidPlacementCount > 0 || invalidLinkCount > 0 || clientTaskCount !== expectedClientTaskCount) {
    issues.push({
      import_run_id: importRunId,
      severity: "error",
      code: "VALIDATION_FAILED",
      message: `Post-import validation failed: ${invalidPlacementCount} tasks have invalid Project/Section placement, ${invalidLinkCount} task-project links exist, and ${clientTaskCount}/${expectedClientTaskCount} tasks have expected Client placement.`,
    })
    console.error("  ❌ VALIDATION FAILED!")
  } else {
    console.log("  ✅ Imported tasks have the expected Client placement and no native Project/Section placement")
    console.log("  ✅ No TaskProjectLink records for imported tasks")
  }

  // Client validation
  const importedClientCount = await prisma.client.count({
    where: { id: { startsWith: "mig_asana-client_" } },
  })
  console.log(`  Source-backed clients: ${importedClientCount}`)
  console.log(`  Expected: ${projectGids.length}`)

  // Verify imported tasks are connected to the source-backed Clients.
  const clientIds = projectGids.map((gid) => deterministicId("asana-client", gid))
  const tasksOnClients = await prisma.task.count({
    where: {
      id: { in: taskIdArray },
      client_id: { in: clientIds },
    },
  })
  console.log(`  Imported tasks connected to imported clients: ${tasksOnClients}`)

  // Verify no projects created from source
  const sourceProjects = await prisma.project.count({
    where: { id: { startsWith: "mig_project_" } },
  })
  console.log(`  Projects created from source projects: ${sourceProjects}`)

  // Verify no source sections
  const sourceSections = await prisma.section.count({
    where: { id: { startsWith: "mig_section_" } },
  })
  console.log(`  Sections created from source sections: ${sourceSections}`)
}

// ---------------------------------------------------------------------------
// Main import flow
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs()

  console.log("=== Asana JSONL Bundle Importer ===")
  console.log(`  Mode: ${args.dryRun ? "DRY RUN" : "APPLY"}`)
  console.log(`  File: ${args.filePath}`)
  console.log(`  Batch size: ${args.batchSize}`)

  // Preflight
  console.log("\n--- Preflight checks ---")
  const { workspace, owner } = await preflight(args)
  console.log(`  ✅ Workspace: ${workspace.name} (${workspace.id})`)
  console.log(`  ✅ Owner: ${owner.full_name} (${owner.email})`)

  // File checksum
  console.log("\n--- Computing file checksum ---")
  const checksum = await fileChecksum(args.filePath)
  console.log(`  SHA-256: ${checksum}`)

  // Parse JSONL
  console.log("\n--- Parsing JSONL file ---")
  const data = await parseJsonlFile(args.filePath)

  if (!data.manifest) {
    throw new Error("No manifest record found in JSONL file")
  }

  console.log(`  Manifest format: ${data.manifest.format}`)
  console.log(`  Entity counts from file:`)
  for (const [type, count] of Object.entries(data.counts).sort()) {
    console.log(`    ${type}: ${count}`)
  }
  console.log(`  People: ${data.people.length}`)
  console.log(`  Projects: ${data.projects.length}`)
  console.log(`  Tasks: ${data.tasks.length}`)
  console.log(`  Parent links: ${data.parentLinks.length}`)
  console.log(`  Recurring tasks: ${data.recurringTasks.size}`)
  console.log(`  Attachment metadata: ${data.attachmentMetadata.length}`)
  console.log(`  Section records (skipped): ${data.sectionCount}`)
  console.log(`  Direct memberships (skipped): ${data.directMembershipCount}`)
  console.log(`  Effective memberships (skipped): ${data.effectiveMembershipCount}`)

  // Create ImportRun
  const stats = emptyStats()
  const issues: Array<Prisma.ImportIssueCreateManyInput> = []

  let importRunId: string

  if (!args.dryRun) {
    const importRun = await prisma.importRun.create({
      data: {
        workspace_id: workspace.id,
        requested_by: owner.id,
        source: "asana_jsonl_bundle",
        kind: "one_time_migration",
        status: "running",
        phase: "preflight",
        summary_json: JSON.stringify({
          file: args.filePath,
          checksum,
          mode: "apply",
          format: data.manifest.format,
          entityCounts: data.counts,
        }),
      },
      select: { id: true },
    })
    importRunId = importRun.id
  } else {
    importRunId = "dry-run-placeholder"
  }

  try {
    // Phase 1: People
    console.log("\n--- Phase: People ---")
    if (!args.dryRun) {
      await prisma.importRun.update({
        where: { id: importRunId },
        data: { phase: "people" },
      })
    }
    const personMap = await importPeople(
      data.people,
      workspace.id,
      stats,
      issues,
      importRunId,
      args.dryRun
    )
    console.log(`  Created: ${stats.peopleCreated}, Mapped: ${stats.peopleMapped}`)

    // Phase 2: Clients
    console.log("\n--- Phase: Clients ---")
    if (!args.dryRun) {
      await prisma.importRun.update({
        where: { id: importRunId },
        data: { phase: "clients" },
      })
    }
    const clientMap = await importClients(
      data.projects,
      data.clientMappings,
      workspace.id,
      stats,
      issues,
      importRunId,
      args.dryRun
    )
    console.log(
      `  Created: ${stats.clientsCreated}, Updated: ${stats.clientsUpdated}, Failed: ${stats.clientsFailed}`
    )

    // Phase 3: Tasks. Source project membership resolves to direct Client work;
    // native Project/Section placement stays null in this import mode.
    console.log("\n--- Phase: Tasks ---")
    if (!args.dryRun) {
      await prisma.importRun.update({
        where: { id: importRunId },
        data: { phase: "tasks" },
      })
    }
    const importActor = await ensureImportActor(workspace.id, args.dryRun)
    const importedTaskIds = await importTasks(
      data.tasks,
      workspace.id,
      importActor.id,
      personMap,
      clientMap,
      data.recurringTasks,
      stats,
      issues,
      importRunId,
      args.batchSize,
      args.dryRun
    )
    console.log(
      `  Created/Updated: ${stats.tasksCreated}, Failed: ${stats.tasksFailed}`
    )

    // Phase 4: Parent links. Client placement was resolved from each task's
    // effective primary source project before the hierarchy is connected.
    console.log("\n--- Phase: Parent Links ---")
    if (!args.dryRun) {
      await prisma.importRun.update({
        where: { id: importRunId },
        data: { phase: "parent_links" },
      })
    }
    await importParentLinks(
      data.parentLinks,
      importedTaskIds,
      stats,
      issues,
      importRunId,
      args.batchSize,
      args.dryRun
    )
    console.log(
      `  Resolved: ${stats.parentLinksResolved}, Unresolved: ${stats.parentLinksUnresolved}`
    )

    // Phase 5: Cleanup relations from previous import
    console.log("\n--- Phase: Cleanup Relations ---")
    if (!args.dryRun) {
      await prisma.importRun.update({
        where: { id: importRunId },
        data: { phase: "cleanup_relations" },
      })
    }
    await cleanupPreviousImport(
      importedTaskIds,
      stats,
      issues,
      importRunId,
      args.dryRun
    )
    console.log(`  Links removed: ${stats.previousLinksRemoved}`)
    console.log(`  Projects deleted: ${stats.previousProjectsDeleted}`)
    console.log(`  Projects archived: ${stats.previousProjectsArchived}`)

    // Record attachment metadata skip
    stats.attachmentsSkipped = data.attachmentMetadata.length
    if (data.attachmentMetadata.length > 0) {
      issues.push({
        import_run_id: importRunId,
        severity: "warning",
        code: "ATTACHMENT_METADATA_ONLY",
        source_type: "attachment",
        message: `${data.attachmentMetadata.length} attachment metadata records were skipped because no downloadable URL or filename is available.`,
      })
    }

    // Record scientific notation warning
    issues.push({
      import_run_id: importRunId,
      severity: "info",
      code: "SCIENTIFIC_IDS",
      source_type: "task",
      message:
        "Some source task IDs were converted to scientific notation and lost precision; deterministic migration keys (task_import_key) were used instead.",
    })

    // Phase 6: Validation
    console.log("\n--- Phase: Validation ---")
    if (!args.dryRun) {
      await prisma.importRun.update({
        where: { id: importRunId },
        data: { phase: "validation" },
      })
    }
    await validateImport(
      importedTaskIds,
      data.projects.map((p) => normalizeText(p.project_gid)),
      stats,
      issues,
      importRunId,
      args.dryRun,
      data.tasks.filter((task) => resolveAsanaTaskClientId(task, clientMap)).length,
    )

    // Write issues
    if (!args.dryRun && issues.length > 0) {
      // Batch insert issues
      for (let i = 0; i < issues.length; i += 500) {
        await prisma.importIssue.createMany({
          data: issues.slice(i, i + 500),
        })
      }
    }

    // Summary
    const summary = {
      mode: args.dryRun ? "dry_run" : "apply",
      file: args.filePath,
      checksum,
      workspace: { id: workspace.id, name: workspace.name },
      owner: { id: owner.id, email: owner.email, name: owner.full_name },
      entityCounts: data.counts,
      people: {
        total: data.people.length,
        created: stats.peopleCreated,
        mapped: stats.peopleMapped,
      },
      clients: {
        total: data.projects.length,
        created: stats.clientsCreated,
        updated: stats.clientsUpdated,
        skipped: stats.clientsSkipped,
        failed: stats.clientsFailed,
      },
      tasks: {
        total: data.tasks.length,
        created: stats.tasksCreated,
        updated: stats.tasksUpdated,
        skipped: stats.tasksSkipped,
        failed: stats.tasksFailed,
      },
      parentLinks: {
        total: data.parentLinks.length,
        resolved: stats.parentLinksResolved,
        unresolved: stats.parentLinksUnresolved,
      },
      attachmentsSkipped: stats.attachmentsSkipped,
      recurringTasks: data.recurringTasks.size,
      cleanup: {
        linksRemoved: stats.previousLinksRemoved,
        projectsDeleted: stats.previousProjectsDeleted,
        projectsArchived: stats.previousProjectsArchived,
      },
      issueCount: issues.length,
      warningCount: stats.warningCount,
    }

    // Complete ImportRun
    if (!args.dryRun) {
      await prisma.importRun.update({
        where: { id: importRunId },
        data: {
          status: "completed",
          phase: "completed",
          summary_json: JSON.stringify(summary),
          completed_at: new Date(),
        },
      })

      await prisma.activityLog.create({
        data: {
          workspace_id: workspace.id,
          actor_id: owner.id,
          entity_type: "workspace",
          entity_id: workspace.id,
          action: "asana_jsonl_import_completed",
          meta_json: JSON.stringify(summary),
        },
      })
    }

    console.log("\n=== IMPORT SUMMARY ===")
    console.log(JSON.stringify(summary, null, 2))

    if (args.dryRun) {
      console.log("\n✅ Dry run complete. No database changes were made.")
    } else {
      console.log("\n✅ Import complete.")
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown import error"

    if (!args.dryRun) {
      await prisma.importRun.update({
        where: { id: importRunId },
        data: {
          status: "failed",
          phase: "failed",
          error_message: message,
          completed_at: new Date(),
        },
      })
    }

    throw error
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
