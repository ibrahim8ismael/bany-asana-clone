import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { PrismaClient, type Prisma } from "@prisma/client"
import { parseCsv, type CsvRow } from "../src/lib/csv"

const prisma = new PrismaClient()

const FILES = {
  tasks: "01_tasks.csv",
  projects: "02_projects.csv",
  people: "03_people.csv",
  sections: "04_sections.csv",
  taskProjects: "05_task_projects.csv",
  taskParents: "06_task_parents.csv",
  attachments: "07_attachments.csv",
} as const

const EXPECTED_COUNTS = {
  tasks: 16075,
  projects: 52,
  people: 21,
  sections: 161,
  taskProjects: 15914,
  taskParents: 3001,
  attachments: 1063,
} as const

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
  none: "#6b7280",
}

const configuredBatchSize = Number.parseInt(
  process.env.ASANA_IMPORT_BATCH_SIZE || "200",
  10
)
const batchSize =
  Number.isFinite(configuredBatchSize) && configuredBatchSize >= 25
    ? configuredBatchSize
    : 200

type ProjectRef = {
  id: string
  clientId: string
}

type SectionRef = {
  id: string
  projectId: string
}

type TaskRef = {
  id: string
  clientId: string | null
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim()
}

function normalizeLookup(value: string | null | undefined) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ")
}

 
function parseBoolean(value: string | null | undefined) {
  return ["true", "1", "yes"].includes(normalizeLookup(value))
}

function parseInteger(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) return null

  const parsed = Number.parseInt(normalized, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDate(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) return null

  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? `${normalized}T00:00:00.000Z`
      : normalized
  )

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid source date: ${normalized}`)
  }

  return date
}

function sourceStatus(value: string) {
  return normalizeLookup(value) === "completed" ? "complete" : "incomplete"
}

function deterministicId(type: string, sourceKey: string) {
  const digest = crypto
    .createHash("sha256")
    .update(`one-time-migration:${type}:${sourceKey}`)
    .digest("hex")
    .slice(0, 24)

  return `mig_${type}_${digest}`
}

function placeholderEmail(personImportKey: string) {
  return `${deterministicId("person", personImportKey)}@import.invalid`
}

function decodeProjectDescription(value: string) {
  const normalized = normalizeText(value)
  return normalized ? normalized.replace(/\\n/g, "\n") : null
}

function recurrenceNote(row: CsvRow) {
  const type = normalizeText(row.recurrence_type)
  if (!type) return null

  const details = [
    `type: ${type}`,
    normalizeText(row.recurrence_frequency)
      ? `frequency: ${normalizeText(row.recurrence_frequency)}`
      : null,
    normalizeText(row.recurrence_days_of_week)
      ? `days: ${normalizeText(row.recurrence_days_of_week)}`
      : null,
    normalizeText(row.recurrence_original_due_date)
      ? `original due date: ${normalizeText(row.recurrence_original_due_date)}`
      : null,
  ].filter(Boolean)

  return `Recurring schedule from the previous system — ${details.join(", ")}`
}

function taskDescription(row: CsvRow) {
  const description = normalizeText(row.description)
  const recurrence = recurrenceNote(row)
  if (!recurrence) return description || null
  return description ? `${description}\n\n${recurrence}` : recurrence
}

async function loadRows(packageDir: string, fileName: string) {
  const filePath = path.join(packageDir, fileName)
  return parseCsv(await fs.readFile(filePath, "utf8"))
}

async function loadPackage(packageDir: string) {
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, fileName]) => {
      return [key, await loadRows(packageDir, fileName)] as const
    })
  )
  const data = Object.fromEntries(entries) as Record<keyof typeof FILES, CsvRow[]>

  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = data[key as keyof typeof data].length
    if (actual !== expected) {
      throw new Error(
        `${FILES[key as keyof typeof FILES]} contains ${actual} rows; expected ${expected}`
      )
    }
  }

  return data
}

async function runBatches<T>(
  label: string,
  rows: T[],
  handler: (batch: T[], offset: number) => Promise<void>
) {
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize)
    await handler(batch, offset)

    const processed = Math.min(offset + batch.length, rows.length)
    if (processed === rows.length || processed % 1000 < batch.length) {
      console.log(`${label}: ${processed}/${rows.length}`)
    }
  }
}

async function findImportOwner() {
  const requestedEmail = normalizeLookup(
    process.env.ASANA_IMPORT_USER_EMAIL || "alice@example.com"
  )
  const requestedWorkspaceId = normalizeText(
    process.env.ASANA_IMPORT_WORKSPACE_ID
  )
  const owner = await prisma.user.findUnique({
    where: { email: requestedEmail },
    select: {
      id: true,
      email: true,
      full_name: true,
      active_workspace_id: true,
    },
  })

  if (!owner) {
    throw new Error(`Import owner ${requestedEmail} was not found`)
  }

  const workspaceId = requestedWorkspaceId || owner.active_workspace_id
  if (!workspaceId) {
    throw new Error(`Import owner ${requestedEmail} has no active workspace`)
  }

  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { owner_id: owner.id },
        {
          members: {
            some: {
              user_id: owner.id,
              role: { in: ["owner", "admin"] },
            },
          },
        },
      ],
    },
    select: { id: true, name: true },
  })

  if (!workspace) {
    throw new Error(`Import owner cannot administer workspace ${workspaceId}`)
  }

  return { owner, workspace }
}

async function importPeople(rows: CsvRow[], workspaceId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { workspace_id: workspaceId },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          full_name: true,
        },
      },
    },
  })
  const workspaceUsers = memberships.map((membership) => membership.user)
  const byEmail = new Map(
    workspaceUsers.map((user) => [normalizeLookup(user.email), user])
  )
  const byName = new Map(
    workspaceUsers.map((user) => [normalizeLookup(user.full_name), user])
  )
  const personMap = new Map<string, string>()
  let created = 0
  let mapped = 0

  for (const row of rows) {
    const personImportKey = normalizeText(row.person_import_key)
    const displayName =
      normalizeText(row.display_name) || "Imported team member"
    const sourceEmail = normalizeLookup(row.email)
    const stableId = deterministicId("person", personImportKey)

    let user =
      (sourceEmail ? byEmail.get(sourceEmail) : undefined) ||
      byName.get(normalizeLookup(displayName)) ||
      (await prisma.user.findUnique({
        where: { id: stableId },
        select: { id: true, email: true, full_name: true },
      }))

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: stableId,
          full_name: displayName,
          email: sourceEmail || placeholderEmail(personImportKey),
          password_hash: null,
          active_workspace_id: workspaceId,
        },
        select: { id: true, email: true, full_name: true },
      })
      created += 1
    } else {
      mapped += 1
    }

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

    personMap.set(personImportKey, user.id)
    byEmail.set(normalizeLookup(user.email), user)
    byName.set(normalizeLookup(user.full_name), user)
  }

  return { personMap, created, mapped }
}

async function importClients(projectRows: CsvRow[], workspaceId: string) {
  const projectsByClientKey = new Map<string, CsvRow[]>()

  for (const row of projectRows) {
    const clientName =
      normalizeText(row.final_client_name) ||
      normalizeText(row.suggested_client_name) ||
      normalizeText(row.project_name) ||
      "Imported client"
    const clientKey = normalizeLookup(clientName)
    projectsByClientKey.set(clientKey, [
      ...(projectsByClientKey.get(clientKey) || []),
      row,
    ])
  }

  const existingClients = await prisma.client.findMany({
    where: { workspace_id: workspaceId },
    select: { id: true, name: true },
  })
  const existingByName = new Map(
    existingClients.map((client) => [normalizeLookup(client.name), client])
  )
  const clientMap = new Map<string, string>()
  let created = 0
  let mapped = 0

  for (const [clientKey, rows] of projectsByClientKey) {
    const clientName =
      normalizeText(rows[0].final_client_name) ||
      normalizeText(rows[0].suggested_client_name) ||
      normalizeText(rows[0].project_name) ||
      "Imported client"
    const exactMatch = existingByName.get(clientKey)

    if (exactMatch) {
      clientMap.set(clientKey, exactMatch.id)
      mapped += 1
      continue
    }

    const stableId = deterministicId("client", clientKey)
    const earliestCreatedAt = rows
      .map((row) => parseDate(row.created_at))
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => left.getTime() - right.getTime())[0]
    const client = await prisma.client.upsert({
      where: { id: stableId },
      create: {
        id: stableId,
        workspace_id: workspaceId,
        name: clientName,
        notes: "تم إنشاء العميل أثناء ترحيل بيانات المشاريع.",
        color: COLORS[normalizeText(rows[0].color)] || "#6b7280",
        created_at: earliestCreatedAt || new Date(),
      },
      update: {
        name: clientName,
        color: COLORS[normalizeText(rows[0].color)] || "#6b7280",
      },
      select: { id: true },
    })

    clientMap.set(clientKey, client.id)
    created += 1
  }

  return { clientMap, created, mapped }
}

async function importProjects(
  rows: CsvRow[],
  workspaceId: string,
  ownerId: string,
  clientMap: Map<string, string>
) {
  const projectMap = new Map<string, ProjectRef>()

  await runBatches("Projects", rows, async (batch) => {
    await prisma.$transaction(
      batch.map((row) => {
        const projectGid = normalizeText(row.project_gid)
        const projectName =
          normalizeText(row.project_name) || "Imported project"
        const clientName =
          normalizeText(row.final_client_name) ||
          normalizeText(row.suggested_client_name) ||
          projectName
        const clientId = clientMap.get(normalizeLookup(clientName))
        if (!clientId) {
          throw new Error(`Client mapping missing for project ${projectGid}`)
        }

        const id = deterministicId("project", projectGid)
        projectMap.set(projectGid, { id, clientId })
        const createdAt = parseDate(row.created_at) || new Date()
        const updatedAt = parseDate(row.modified_at) || createdAt
        const common = {
          workspace_id: workspaceId,
          client_id: clientId,
          name: projectName,
          description: decodeProjectDescription(row.description),
          color: COLORS[normalizeText(row.color)] || "#6b7280",
          owner_id: ownerId,
          privacy: "workspace_visible",
          default_view: "list",
          // Source projects are retained as hidden migration containers so
          // many-to-many Asana membership and section metadata stay auditable.
          // Their tasks are surfaced as direct client work in the product.
          archived: true,
          updated_at: updatedAt,
        } satisfies Prisma.ProjectUncheckedUpdateInput

        return prisma.project.upsert({
          where: { id },
          create: {
            id,
            ...common,
            status: "incomplete",
            icon: "briefcase",
            created_at: createdAt,
          },
          update: common,
        })
      })
    )
  })

  await prisma.$transaction(
    [...projectMap.values()].map((project) =>
      prisma.projectMember.upsert({
        where: {
          project_id_user_id: {
            project_id: project.id,
            user_id: ownerId,
          },
        },
        create: {
          project_id: project.id,
          user_id: ownerId,
          role: "owner",
        },
        update: { role: "owner" },
      })
    )
  )

  return projectMap
}

async function importSections(
  rows: CsvRow[],
  projectMap: Map<string, ProjectRef>
) {
  const sectionMap = new Map<string, SectionRef>()
  const projectPositions = new Map<string, number>()

  await runBatches("Sections", rows, async (batch) => {
    await prisma.$transaction(
      batch.map((row) => {
        const sectionGid = normalizeText(row.section_gid)
        const projectGid = normalizeText(row.project_gid)
        const project = projectMap.get(projectGid)
        if (!project) {
          throw new Error(
            `Project ${projectGid} missing for section ${sectionGid}`
          )
        }

        const id = deterministicId("section", sectionGid)
        const position = (projectPositions.get(projectGid) || 0) + 1000
        projectPositions.set(projectGid, position)
        sectionMap.set(sectionGid, { id, projectId: project.id })

        return prisma.section.upsert({
          where: { id },
          create: {
            id,
            project_id: project.id,
            name: normalizeText(row.section_name) || "Imported",
            position,
          },
          update: {
            project_id: project.id,
            name: normalizeText(row.section_name) || "Imported",
            position,
          },
        })
      })
    )
  })

  return sectionMap
}

async function importTasks(
  rows: CsvRow[],
  workspaceId: string,
  ownerId: string,
  personMap: Map<string, string>,
  projectMap: Map<string, ProjectRef>
) {
  const taskMap = new Map<string, TaskRef>()

  await runBatches("Tasks", rows, async (batch) => {
    await prisma.$transaction(
      batch.map((row) => {
        const importKey = normalizeText(row.task_import_key)
        const id = deterministicId("task", importKey)
        const project = projectMap.get(
          normalizeText(row.effective_primary_project_gid)
        )
        const status = sourceStatus(row.status)
        const createdAt = parseDate(row.created_at) || new Date()
        const updatedAt = parseDate(row.modified_at) || createdAt
        const completedAt =
          status === "complete" ? parseDate(row.completed_at) : null
        const position = (parseInteger(row.source_csv_row) || 0) * 1000
        const common = {
          workspace_id: workspaceId,
          project_id: null,
          client_id: project?.clientId || null,
          section_id: null,
          title: normalizeText(row.title) || "Imported task",
          description_rich_text: taskDescription(row),
          status,
          assignee_id:
            personMap.get(normalizeText(row.assignee_person_import_key)) ||
            null,
          creator_id: ownerId,
          due_date: parseDate(row.due_date),
          completed_at: completedAt,
          task_type: "task",
          quality_required: false,
          quality_state: "not_required",
          position,
          archived: false,
          updated_at: updatedAt,
        } satisfies Prisma.TaskUncheckedUpdateInput

        taskMap.set(importKey, {
          id,
          clientId: project?.clientId || null,
        })

        return prisma.task.upsert({
          where: { id },
          create: {
            id,
            ...common,
            parent_task_id: null,
            created_at: createdAt,
          },
          update: common,
        })
      })
    )
  })

  return taskMap
}

async function importTaskProjectLinks(
  rows: CsvRow[],
  taskMap: Map<string, TaskRef>,
  projectMap: Map<string, ProjectRef>,
  sectionMap: Map<string, SectionRef>
) {
  await runBatches(
    "Task-project relations",
    rows,
    async (batch, offset) => {
      await prisma.$transaction(
        batch.map((row, index) => {
          const task = taskMap.get(normalizeText(row.task_import_key))
          const project = projectMap.get(normalizeText(row.project_gid))
          const section = sectionMap.get(normalizeText(row.section_gid))
          if (!task || !project) {
            throw new Error(
              `Task-project relation ${offset + index + 2} has a missing target`
            )
          }

          const sectionId =
            section?.projectId === project.id ? section.id : null
          return prisma.taskProjectLink.upsert({
            where: {
              task_id_project_id: {
                task_id: task.id,
                project_id: project.id,
              },
            },
            create: {
              task_id: task.id,
              project_id: project.id,
              section_id: sectionId,
              position: (offset + index + 1) * 1000,
            },
            update: {
              section_id: sectionId,
              position: (offset + index + 1) * 1000,
            },
          })
        })
      )
    }
  )
}

async function importParentLinks(
  rows: CsvRow[],
  taskMap: Map<string, TaskRef>
) {
  const resolved = rows.filter(
    (row) =>
      normalizeLookup(row.resolution_status) === "resolved" &&
      normalizeText(row.resolved_parent_task_import_key)
  )
  const unresolved = rows.filter(
    (row) => normalizeLookup(row.resolution_status) !== "resolved"
  )

  await runBatches("Parent links", resolved, async (batch) => {
    await prisma.$transaction(
      batch.map((row) => {
        const child = taskMap.get(
          normalizeText(row.child_task_import_key)
        )
        const parent = taskMap.get(
          normalizeText(row.resolved_parent_task_import_key)
        )
        if (!child || !parent) {
          throw new Error(
            `Resolved parent link is missing a task for ${row.child_task_import_key}`
          )
        }

        return prisma.task.update({
          where: { id: child.id },
          data: {
            parent_task_id: parent.id,
            // A nested task belongs with its visible parent in the client view.
            ...(parent.clientId ? { client_id: parent.clientId } : {}),
          },
        })
      })
    )
  })

  return unresolved
}

async function updateProjectStatuses(projectMap: Map<string, ProjectRef>) {
  for (const project of projectMap.values()) {
    const openTasks = await prisma.task.count({
      where: {
        task_links: { some: { project_id: project.id } },
        status: { not: "complete" },
        archived: false,
      },
    })

    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: openTasks === 0 ? "complete" : "incomplete",
      },
    })
  }
}

async function main() {
  const packageDirArgument = normalizeText(
    process.argv[2] || process.env.ASANA_CSV_DIR
  )
  if (!packageDirArgument) {
    throw new Error(
      "Usage: npm run db:import:asana -- <path-to-asana-csv-package>"
    )
  }

  const packageDir = path.resolve(packageDirArgument)
  const data = await loadPackage(packageDir)
  const { owner, workspace } = await findImportOwner()

  console.log(
    `Importing package into ${workspace.name} as ${owner.full_name} (${owner.email})`
  )

  const importRun = await prisma.importRun.create({
    data: {
      workspace_id: workspace.id,
      requested_by: owner.id,
      source: "asana_csv_package",
      kind: "one_time_migration",
      status: "running",
      phase: "people",
      summary_json: JSON.stringify({
        expected: EXPECTED_COUNTS,
        strategy: "native_schema_with_deterministic_import_ids",
      }),
    },
    select: { id: true },
  })

  try {
    const people = await importPeople(data.people, workspace.id)

    await prisma.importRun.update({
      where: { id: importRun.id },
      data: { phase: "clients_and_projects" },
    })
    const clients = await importClients(data.projects, workspace.id)
    const projects = await importProjects(
      data.projects,
      workspace.id,
      owner.id,
      clients.clientMap
    )

    await prisma.importRun.update({
      where: { id: importRun.id },
      data: { phase: "sections" },
    })
    const sections = await importSections(data.sections, projects)

    await prisma.importRun.update({
      where: { id: importRun.id },
      data: { phase: "tasks" },
    })
    const tasks = await importTasks(
      data.tasks,
      workspace.id,
      owner.id,
      people.personMap,
      projects
    )

    await prisma.importRun.update({
      where: { id: importRun.id },
      data: { phase: "relations" },
    })
    await importTaskProjectLinks(
      data.taskProjects,
      tasks,
      projects,
      sections
    )
    const unresolvedParents = await importParentLinks(
      data.taskParents,
      tasks
    )
    await updateProjectStatuses(projects)

    await prisma.importIssue.createMany({
      data: [
        ...unresolvedParents.map((row) => ({
          import_run_id: importRun.id,
          severity: "warning",
          code: "UNRESOLVED_PARENT",
          source_type: "task",
          source_gid: normalizeText(row.child_task_import_key),
          message: `Parent could not be resolved for ${row.child_task_import_key}`,
          details_json: JSON.stringify(row),
        })),
        {
          import_run_id: importRun.id,
          severity: "warning",
          code: "SCIENTIFIC_IDS",
          source_type: "task",
          message:
            "1431 source task IDs were unrecoverable; deterministic migration keys were used internally.",
        },
        {
          import_run_id: importRun.id,
          severity: "warning",
          code: "ATTACHMENT_METADATA_ONLY",
          source_type: "attachment",
          message:
            "1063 attachment rows had no filename or downloadable URL, so broken attachment records were not added to tasks.",
        },
      ],
    })

    const summary = {
      workspace: workspace.name,
      people: {
        imported: data.people.length,
        created: people.created,
        mappedToExisting: people.mapped,
      },
      clients: {
        imported: clients.clientMap.size,
        created: clients.created,
        mappedToExisting: clients.mapped,
      },
      projects: data.projects.length,
      sections: data.sections.length,
      tasks: data.tasks.length,
      taskProjectRelations: data.taskProjects.length,
      parentLinksResolved:
        data.taskParents.length - unresolvedParents.length,
      parentLinksUnresolved: unresolvedParents.length,
      attachmentMetadataRowsSkipped: data.attachments.length,
    }

    await prisma.importRun.update({
      where: { id: importRun.id },
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
        action: "one_time_data_migration_completed",
        meta_json: JSON.stringify(summary),
      },
    })

    console.log(JSON.stringify(summary, null, 2))
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown import error"
    await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        status: "failed",
        phase: "failed",
        error_message: message,
        completed_at: new Date(),
      },
    })
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
