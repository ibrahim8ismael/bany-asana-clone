import type { Prisma } from "@prisma/client"
import { parseCsv, type CsvRow } from "@/lib/csv"
import { prisma } from "@/lib/prisma"
import { deriveProjectCompletionStatus } from "@/lib/workflow"

const HEADER_ALIASES = {
  title: ["title", "name", "task name"],
  description: ["description", "notes"],
  status: ["status"],
  completed: ["completed", "is completed"],
  priority: ["priority"],
  assigneeName: ["assignee", "assignee name"],
  assigneeEmail: ["assignee email", "email"],
  projectName: ["project", "projects", "project name"],
  sectionName: ["section", "section/column", "column", "section name"],
  startDate: ["start date", "start"],
  dueDate: ["due date", "due on", "due"],
  completedAt: ["completed at"],
  createdAt: ["created at"],
  updatedAt: ["updated at", "modified at", "last modified"],
  tags: ["tags"],
  parentTask: ["parent task", "parent task title", "parent"],
  taskType: ["task type", "type"],
} as const

const NORMALIZED_STANDARD_HEADERS = new Set(
  Object.values(HEADER_ALIASES)
    .flat()
    .map((header) => normalizeHeader(header))
)

export type SupportedCustomFieldType = "text" | "number" | "date" | "checkbox" | "single_select"

export type ImportTarget =
  | { type: "existing_project"; projectId: string }
  | { type: "new_project"; workspaceId: string; projectName: string }
  | { type: "personal"; workspaceId: string }

export interface CustomFieldCandidate {
  header: string
  inferredType: SupportedCustomFieldType
  sampleValues: string[]
}

export interface ImportableCustomField {
  id: string
  name: string
  type: string
  project_id: string | null
}

export interface CustomFieldMappingInput {
  header: string
  action: "ignore" | "create" | "map"
  customFieldId?: string
  fieldName?: string
  fieldType?: SupportedCustomFieldType
}

interface ParsedTaskImportRow {
  rowNumber: number
  title: string
  description: string | null
  status: string
  priority: string | null
  assigneeName: string | null
  assigneeEmail: string | null
  projectName: string | null
  sectionName: string | null
  startDate: Date | null
  dueDate: Date | null
  completedAt: Date | null
  createdAt: Date | null
  updatedAt: Date | null
  tags: string[]
  parentTask: string | null
  taskType: string
  customFieldValues: Record<string, string>
}

interface PreviewRow {
  rowNumber: number
  title: string
  status: string
  assignee: string | null
  section: string | null
  dueDate: string | null
  parentTask: string | null
}

export interface PreviewResult {
  headers: string[]
  totalRows: number
  validRows: number
  previewRows: PreviewRow[]
  warnings: string[]
  detectedSections: string[]
  customFieldCandidates: CustomFieldCandidate[]
}

export interface ImportResult {
  createdCount: number
  warnings: string[]
  projectId: string | null
  createdUsers: number
  createdSections: number
  createdCustomFields: number
}

interface ParsedRowsResult {
  headers: string[]
  rows: ParsedTaskImportRow[]
  warnings: string[]
  customFieldCandidates: CustomFieldCandidate[]
}

interface ResolvedCustomFieldMapping {
  id: string
  name: string
  type: SupportedCustomFieldType
}

function normalizeHeader(value: string) {
  return value.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
}

function getValue(row: CsvRow, aliases: readonly string[]) {
  const entries = Object.entries(row)
  for (const alias of aliases) {
    const found = entries.find(([header]) => normalizeHeader(header) === normalizeHeader(alias))
    if (found && found[1]) return found[1]
  }
  return ""
}

function parseDate(value: string) {
  if (!value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeStatus(row: CsvRow, options?: { completedAt?: Date | null; sectionName?: string | null }) {
  const statusValue = getValue(row, HEADER_ALIASES.status).trim().toLowerCase()
  const completedValue = getValue(row, HEADER_ALIASES.completed).trim().toLowerCase()
  const sectionValue = options?.sectionName?.trim().toLowerCase() || ""

  if (options?.completedAt) {
    return "complete"
  }

  if (["true", "yes", "1", "complete", "completed", "done"].includes(completedValue)) {
    return "complete"
  }

  if (["approved", "completed", "complete", "done", "closed"].includes(sectionValue)) {
    return "complete"
  }

  if (["complete", "completed", "done"].includes(statusValue)) return "complete"
  if (["backlog", "back log", "icebox", "ice box"].includes(statusValue)) return "backlog"
  if (["in progress", "in_progress", "progress", "doing"].includes(statusValue)) return "in_progress"
  return "incomplete"
}

function normalizePriority(value: string) {
  const normalized = value.trim().toLowerCase()
  if (["high", "medium", "low"].includes(normalized)) return normalized
  return null
}

function splitTags(value: string) {
  return value
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function inferCustomFieldType(values: string[]): SupportedCustomFieldType {
  const normalized = values.map((value) => value.trim()).filter(Boolean)
  if (normalized.length === 0) return "text"

  if (normalized.every((value) => ["true", "false", "yes", "no", "1", "0"].includes(value.toLowerCase()))) {
    return "checkbox"
  }

  if (normalized.every((value) => !Number.isNaN(Number(value)))) {
    return "number"
  }

  if (normalized.every((value) => !Number.isNaN(new Date(value).getTime()))) {
    return "date"
  }

  const distinctValues = [...new Set(normalized.map((value) => value.toLowerCase()))]
  if (distinctValues.length > 1 && distinctValues.length <= 12) {
    return "single_select"
  }

  return "text"
}

function buildCustomFieldCandidates(rows: CsvRow[]): CustomFieldCandidate[] {
  const samples = new Map<string, string[]>()

  for (const row of rows) {
    for (const [header, value] of Object.entries(row)) {
      if (NORMALIZED_STANDARD_HEADERS.has(normalizeHeader(header))) continue
      const trimmedValue = value.trim()
      if (!trimmedValue) continue

      const existing = samples.get(header) || []
      if (!existing.includes(trimmedValue)) {
        samples.set(header, [...existing, trimmedValue].slice(0, 6))
      }
    }
  }

  return [...samples.entries()].map(([header, sampleValues]) => ({
    header,
    inferredType: inferCustomFieldType(sampleValues),
    sampleValues,
  }))
}

function parseRows(csvText: string): ParsedRowsResult {
  const rawRows = parseCsv(csvText)
  const warnings: string[] = []
  const customFieldCandidates = buildCustomFieldCandidates(rawRows)

  const parsedRows: ParsedTaskImportRow[] = rawRows
    .map((row, index) => {
      const title = getValue(row, HEADER_ALIASES.title).trim()
      if (!title) {
        warnings.push(`Row ${index + 2}: missing task title and will be skipped.`)
        return null
      }

      const startDate = parseDate(getValue(row, HEADER_ALIASES.startDate))
      const dueDate = parseDate(getValue(row, HEADER_ALIASES.dueDate))
      const completedAt = parseDate(getValue(row, HEADER_ALIASES.completedAt))
      const createdAt = parseDate(getValue(row, HEADER_ALIASES.createdAt))
      const updatedAt = parseDate(getValue(row, HEADER_ALIASES.updatedAt))

      const rawStartDate = getValue(row, HEADER_ALIASES.startDate)
      const rawDueDate = getValue(row, HEADER_ALIASES.dueDate)
      const rawCreatedAt = getValue(row, HEADER_ALIASES.createdAt)
      const rawUpdatedAt = getValue(row, HEADER_ALIASES.updatedAt)

      if (rawStartDate && !startDate) warnings.push(`Row ${index + 2}: invalid start date "${rawStartDate}".`)
      if (rawDueDate && !dueDate) warnings.push(`Row ${index + 2}: invalid due date "${rawDueDate}".`)
      if (rawCreatedAt && !createdAt) warnings.push(`Row ${index + 2}: invalid created at "${rawCreatedAt}".`)
      if (rawUpdatedAt && !updatedAt) warnings.push(`Row ${index + 2}: invalid updated at "${rawUpdatedAt}".`)

      const customFieldValues = Object.fromEntries(
        Object.entries(row)
          .filter(([header, value]) => !NORMALIZED_STANDARD_HEADERS.has(normalizeHeader(header)) && value.trim())
          .map(([header, value]) => [header, value.trim()])
      )

      const sectionName = getValue(row, HEADER_ALIASES.sectionName).trim() || null
      const normalizedStatus = normalizeStatus(row, { completedAt, sectionName })

      return {
        rowNumber: index + 2,
        title,
        description: getValue(row, HEADER_ALIASES.description).trim() || null,
        status: normalizedStatus,
        priority: normalizePriority(getValue(row, HEADER_ALIASES.priority)),
        assigneeName: getValue(row, HEADER_ALIASES.assigneeName).trim() || null,
        assigneeEmail: getValue(row, HEADER_ALIASES.assigneeEmail).trim().toLowerCase() || null,
        projectName: getValue(row, HEADER_ALIASES.projectName).trim() || null,
        sectionName,
        startDate,
        dueDate,
        completedAt,
        createdAt,
        updatedAt,
        tags: splitTags(getValue(row, HEADER_ALIASES.tags)),
        parentTask: getValue(row, HEADER_ALIASES.parentTask).trim() || null,
        taskType: getValue(row, HEADER_ALIASES.taskType).trim() || "task",
        customFieldValues,
      }
    })
    .filter((row): row is ParsedTaskImportRow => Boolean(row))

  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : []
  return { headers, rows: parsedRows, warnings, customFieldCandidates }
}

export function previewTaskImport(csvText: string): PreviewResult {
  const { headers, rows, warnings, customFieldCandidates } = parseRows(csvText)

  return {
    headers,
    totalRows: rows.length,
    validRows: rows.length,
    previewRows: rows.slice(0, 10).map((row) => ({
      rowNumber: row.rowNumber,
      title: row.title,
      status: row.status,
      assignee: row.assigneeEmail || row.assigneeName,
      section: row.sectionName,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      parentTask: row.parentTask,
    })),
    warnings,
    detectedSections: [...new Set(rows.map((row) => row.sectionName).filter(Boolean) as string[])],
    customFieldCandidates,
  }
}

export async function getAvailableImportCustomFields(workspaceId: string, projectId: string | null) {
  const fields = await prisma.customField.findMany({
    where: {
      workspace_id: workspaceId,
      OR: projectId ? [{ project_id: null }, { project_id: projectId }] : [{ project_id: null }],
    },
    select: {
      id: true,
      name: true,
      type: true,
      project_id: true,
    },
    orderBy: [{ project_id: "asc" }, { name: "asc" }],
  })

  return fields as ImportableCustomField[]
}

async function getWorkspaceMemberByName(tx: Prisma.TransactionClient, workspaceId: string, fullName: string) {
  const memberships = await tx.workspaceMember.findMany({
    where: { workspace_id: workspaceId },
    select: {
      user: {
        select: { id: true, full_name: true, email: true },
      },
    },
  })

  const normalizedName = fullName.trim().toLowerCase()
  return memberships.find((membership) => membership.user.full_name.trim().toLowerCase() === normalizedName)?.user || null
}

async function resolveAssignee(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  row: ParsedTaskImportRow,
  warnings: string[],
  options: { createMissingUsers: boolean; forceAssigneeId?: string | null; createdUsersRef: { value: number } }
) {
  if (options.forceAssigneeId) {
    return options.forceAssigneeId
  }

  if (row.assigneeEmail) {
    let user = await tx.user.findUnique({
      where: { email: row.assigneeEmail },
      select: { id: true, full_name: true, email: true },
    })

    if (!user && options.createMissingUsers) {
      user = await tx.user.create({
        data: {
          email: row.assigneeEmail,
          full_name: row.assigneeName || row.assigneeEmail.split("@")[0],
          password_hash: null,
        },
        select: { id: true, full_name: true, email: true },
      })

      options.createdUsersRef.value += 1
      warnings.push(`Created placeholder user for ${user.email}.`)
    }

    if (!user) {
      warnings.push(`Row ${row.rowNumber}: assignee ${row.assigneeEmail} was not matched and task will stay unassigned.`)
      return null
    }

    const membership = await tx.workspaceMember.findFirst({
      where: { workspace_id: workspaceId, user_id: user.id },
      select: { id: true },
    })

    if (!membership) {
      await tx.workspaceMember.create({
        data: {
          workspace_id: workspaceId,
          user_id: user.id,
          role: "member",
        },
      })
    }

    return user.id
  }

  if (row.assigneeName) {
    const user = await getWorkspaceMemberByName(tx, workspaceId, row.assigneeName)
    if (user) return user.id

    warnings.push(`Row ${row.rowNumber}: assignee "${row.assigneeName}" was not matched and task will stay unassigned.`)
  }

  return null
}

async function ensureSection(
  tx: Prisma.TransactionClient,
  options: {
    sectionName: string | null
    projectId: string | null
    userId: string
    isPersonal: boolean
    sectionCache: Map<string, string>
    sectionPositionRef: { value: number }
    createdSectionsRef: { value: number }
  }
) {
  const name = options.sectionName?.trim() || "Imported"
  const cacheKey = `${options.projectId || options.userId}:${name.toLowerCase()}`

  const cached = options.sectionCache.get(cacheKey)
  if (cached) return cached

  const existing = await tx.section.findFirst({
    where: options.isPersonal ? { user_id: options.userId, name } : { project_id: options.projectId, name },
    select: { id: true },
  })

  if (existing) {
    options.sectionCache.set(cacheKey, existing.id)
    return existing.id
  }

  options.sectionPositionRef.value += 1000

  const section = await tx.section.create({
    data: options.isPersonal
      ? { name, user_id: options.userId, position: options.sectionPositionRef.value }
      : { name, project_id: options.projectId, position: options.sectionPositionRef.value },
    select: { id: true },
  })

  options.createdSectionsRef.value += 1
  options.sectionCache.set(cacheKey, section.id)
  return section.id
}

async function ensureTagIds(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  tagNames: string[],
  tagCache: Map<string, string>
) {
  const tagIds: string[] = []

  for (const tagName of tagNames) {
    const key = tagName.toLowerCase()
    const cached = tagCache.get(key)
    if (cached) {
      tagIds.push(cached)
      continue
    }

    const existing = await tx.tag.findFirst({
      where: { workspace_id: workspaceId, name: tagName },
      select: { id: true },
    })

    if (existing) {
      tagCache.set(key, existing.id)
      tagIds.push(existing.id)
      continue
    }

    const created = await tx.tag.create({
      data: { workspace_id: workspaceId, name: tagName },
      select: { id: true },
    })

    tagCache.set(key, created.id)
    tagIds.push(created.id)
  }

  return tagIds
}

async function nextTaskPosition(
  tx: Prisma.TransactionClient,
  sectionId: string | null,
  positionCache: Map<string, number>
) {
  const key = sectionId || "no-section"
  if (!positionCache.has(key)) {
    const lastTask = await tx.task.findFirst({
      where: sectionId ? { section_id: sectionId } : { section_id: null },
      orderBy: { position: "desc" },
      select: { position: true },
    })
    positionCache.set(key, (lastTask?.position ?? 0) + 1000)
  }

  const next = positionCache.get(key) || 1000
  positionCache.set(key, next + 1000)
  return next
}

function parseCheckboxValue(rawValue: string) {
  const normalized = rawValue.trim().toLowerCase()
  if (["true", "yes", "1"].includes(normalized)) return true
  if (["false", "no", "0"].includes(normalized)) return false
  return null
}

function serializeCustomFieldValue(type: SupportedCustomFieldType, rawValue: string) {
  const trimmedValue = rawValue.trim()
  if (!trimmedValue) return null

  switch (type) {
    case "number": {
      const parsed = Number(trimmedValue)
      return Number.isNaN(parsed) ? null : JSON.stringify(parsed)
    }
    case "date": {
      const parsed = new Date(trimmedValue)
      return Number.isNaN(parsed.getTime()) ? null : JSON.stringify(parsed.toISOString())
    }
    case "checkbox": {
      const parsed = parseCheckboxValue(trimmedValue)
      return parsed === null ? null : JSON.stringify(parsed)
    }
    case "single_select":
    case "text":
    default:
      return JSON.stringify(trimmedValue)
  }
}

async function resolveCustomFieldMappings(
  tx: Prisma.TransactionClient,
  options: {
    workspaceId: string
    projectId: string | null
    rows: ParsedTaskImportRow[]
    mappings: CustomFieldMappingInput[]
    createdCustomFieldsRef: { value: number }
  }
) {
  const availableFields = await tx.customField.findMany({
    where: {
      workspace_id: options.workspaceId,
      OR: options.projectId ? [{ project_id: null }, { project_id: options.projectId }] : [{ project_id: null }],
    },
    select: {
      id: true,
      name: true,
      type: true,
      project_id: true,
    },
  })
  const candidateMap = new Map(buildCustomFieldCandidates(options.rows.map((row) => row.customFieldValues)).map((candidate) => [candidate.header, candidate]))
  const mappingResults = new Map<string, ResolvedCustomFieldMapping>()

  for (const mapping of options.mappings) {
    if (mapping.action === "ignore") continue

    if (mapping.action === "map" && mapping.customFieldId) {
      const field = availableFields.find((item) => item.id === mapping.customFieldId)
      if (!field) continue
      mappingResults.set(mapping.header, {
        id: field.id,
        name: field.name,
        type: (field.type as SupportedCustomFieldType) || "text",
      })
      continue
    }

    if (mapping.action === "create") {
      const fieldName = mapping.fieldName?.trim() || mapping.header
      const fieldType = mapping.fieldType || candidateMap.get(mapping.header)?.inferredType || "text"

      const existing = availableFields.find(
        (field) => field.name.trim().toLowerCase() === fieldName.trim().toLowerCase() && field.project_id === (options.projectId || null)
      )

      if (existing) {
        mappingResults.set(mapping.header, {
          id: existing.id,
          name: existing.name,
          type: (existing.type as SupportedCustomFieldType) || fieldType,
        })
        continue
      }

      const createdField = await tx.customField.create({
        data: {
          workspace_id: options.workspaceId,
          project_id: options.projectId,
          name: fieldName,
          type: fieldType,
        },
        select: { id: true, name: true, type: true },
      })

      if (fieldType === "single_select") {
        const values = [...new Set(options.rows.map((row) => row.customFieldValues[mapping.header]).filter(Boolean))]
        if (values.length > 0) {
          await tx.customFieldOption.createMany({
            data: values.map((value, index) => ({
              custom_field_id: createdField.id,
              label: value,
              position: (index + 1) * 1000,
            })),
          })
        }
      }

      options.createdCustomFieldsRef.value += 1
      mappingResults.set(mapping.header, {
        id: createdField.id,
        name: createdField.name,
        type: createdField.type as SupportedCustomFieldType,
      })
    }
  }

  return mappingResults
}

export async function importTasksFromCsv(options: {
  userId: string
  csvText: string
  fileName?: string
  target: ImportTarget
  customFieldMappings?: CustomFieldMappingInput[]
}): Promise<ImportResult> {
  const { rows, warnings } = parseRows(options.csvText)
  if (rows.length === 0) {
    return { createdCount: 0, warnings: ["No valid task rows were found in the CSV."], projectId: null, createdUsers: 0, createdSections: 0, createdCustomFields: 0 }
  }

  const result = await prisma.$transaction(async (tx) => {
    let projectId: string | null = null
    let projectClientId: string | null = null
    let workspaceId = ""
    let projectQualityPolicy = "off"
    const sectionCache = new Map<string, string>()
    const tagCache = new Map<string, string>()
    const positionCache = new Map<string, number>()
    const titleMap = new Map<string, string[]>()
    const sectionPositionRef = { value: 0 }
    const createdTaskIds: string[] = []
    const taskLogEntries: Array<{ taskId: string; workspaceId: string; rowNumber: number; title: string; status: string }> = []
    const customFieldLogEntries: Array<{ taskId: string; workspaceId: string; fieldName: string; value: string }> = []
    const createdUsersRef = { value: 0 }
    const createdSectionsRef = { value: 0 }
    const createdCustomFieldsRef = { value: 0 }

    if (options.target.type === "existing_project") {
      const project = await tx.project.findUnique({
        where: { id: options.target.projectId },
        select: { id: true, workspace_id: true, client_id: true, quality_policy: true },
      })
      if (!project) throw new Error("Target project not found")
      projectId = project.id
      projectClientId = project.client_id
      workspaceId = project.workspace_id
      projectQualityPolicy = project.quality_policy
    } else if (options.target.type === "new_project") {
      workspaceId = options.target.workspaceId
      const project = await tx.project.create({
        data: {
          name: options.target.projectName,
          description: "Imported from CSV",
          default_view: "list",
          workspace_id: workspaceId,
          owner_id: options.userId,
          icon: "project",
          color: "#4f46e5",
          privacy: "workspace_visible",
        },
        select: { id: true },
      })

      await tx.projectMember.create({
        data: {
          project_id: project.id,
          user_id: options.userId,
          role: "owner",
        },
      })

      projectId = project.id
    } else {
      workspaceId = options.target.workspaceId
      warnings.push("Personal import assigns all imported tasks to the current admin so they appear in My Tasks.")
    }

    const resolvedCustomFields = await resolveCustomFieldMappings(tx, {
      workspaceId,
      projectId,
      rows,
      mappings: options.customFieldMappings || [],
      createdCustomFieldsRef,
    })

    const queue = [...rows]
    let safetyPass = 0

    while (queue.length > 0 && safetyPass < 5) {
      safetyPass += 1
      let createdThisPass = 0

      for (let index = queue.length - 1; index >= 0; index -= 1) {
        const row = queue[index]
        const normalizedParentKey = row.parentTask?.trim().toLowerCase() || null
        const parentCandidates = normalizedParentKey ? titleMap.get(normalizedParentKey) || [] : []

        if (normalizedParentKey && parentCandidates.length === 0) {
          continue
        }

        if (normalizedParentKey && parentCandidates.length > 1) {
          warnings.push(`Row ${row.rowNumber}: parent task "${row.parentTask}" is ambiguous, so the task was imported at the top level.`)
        }

        const parentTaskId = parentCandidates[0] || null
        const sectionId = row.parentTask && parentTaskId
          ? null
          : await ensureSection(tx, {
              sectionName: row.sectionName,
              projectId,
              userId: options.userId,
              isPersonal: options.target.type === "personal",
              sectionCache,
              sectionPositionRef,
              createdSectionsRef,
            })

        const position = await nextTaskPosition(tx, sectionId, positionCache)
        const assigneeId = await resolveAssignee(tx, workspaceId, row, warnings, {
          createMissingUsers: true,
          forceAssigneeId: options.target.type === "personal" ? options.userId : null,
          createdUsersRef,
        })
        const tagIds = await ensureTagIds(tx, workspaceId, row.tags, tagCache)

        const task = await tx.task.create({
          data: {
            workspace_id: workspaceId,
            project_id: projectId,
            client_id: projectClientId,
            parent_task_id: parentTaskId,
            section_id: sectionId,
            title: row.title,
            description_rich_text: row.description,
            status: row.status,
            priority: row.priority,
            assignee_id: assigneeId,
            creator_id: options.userId,
            start_date: row.startDate,
            due_date: row.dueDate,
            completed_at: row.status === "complete" ? row.completedAt || row.dueDate || row.updatedAt || row.createdAt || new Date() : null,
            task_type: row.taskType,
            quality_required: !parentTaskId && row.status !== "complete" && projectQualityPolicy === "required",
            quality_state: !parentTaskId && row.status !== "complete" && projectQualityPolicy === "required" ? "ready" : "not_required",
            position,
            created_at: row.createdAt || new Date(),
            updated_at: row.updatedAt || row.createdAt || new Date(),
            tags: tagIds.length > 0 ? {
              create: tagIds.map((tagId) => ({ tag_id: tagId })),
            } : undefined,
          },
          select: { id: true, title: true },
        })

        for (const [header, rawValue] of Object.entries(row.customFieldValues)) {
          const mappedField = resolvedCustomFields.get(header)
          if (!mappedField) continue

          const valueJson = serializeCustomFieldValue(mappedField.type, rawValue)
          if (!valueJson) {
            warnings.push(`Row ${row.rowNumber}: value "${rawValue}" could not be parsed for custom field "${mappedField.name}".`)
            continue
          }

          await tx.taskCustomFieldValue.create({
            data: {
              task_id: task.id,
              custom_field_id: mappedField.id,
              value_json: valueJson,
            },
          })

          customFieldLogEntries.push({
            taskId: task.id,
            workspaceId,
            fieldName: mappedField.name,
            value: rawValue,
          })
        }

        createdTaskIds.push(task.id)
        createdThisPass += 1
        taskLogEntries.push({
          taskId: task.id,
          workspaceId,
          rowNumber: row.rowNumber,
          title: row.title,
          status: row.status,
        })

        const titleKey = row.title.trim().toLowerCase()
        const titleIds = titleMap.get(titleKey) || []
        titleMap.set(titleKey, [...titleIds, task.id])

        queue.splice(index, 1)
      }

      if (createdThisPass === 0) break
    }

    if (queue.length > 0) {
      for (const row of queue) {
        warnings.push(`Row ${row.rowNumber}: could not resolve parent task "${row.parentTask}" and was skipped.`)
      }
    }

    if (projectId) {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: {
          status: true,
          tasks: { where: { archived: false }, select: { status: true } },
        },
      })
      if (project) {
        const nextStatus = deriveProjectCompletionStatus(
          project.status,
          project.tasks.map((task) => task.status)
        )
        if (nextStatus !== project.status) {
          await tx.project.update({ where: { id: projectId }, data: { status: nextStatus } })
        }
      }
    }

    return {
      createdTaskIds,
      projectId,
      workspaceId,
      taskLogEntries,
      customFieldLogEntries,
      createdUsers: createdUsersRef.value,
      createdSections: createdSectionsRef.value,
      createdCustomFields: createdCustomFieldsRef.value,
    }
  })

  for (const entry of result.taskLogEntries) {
    await prisma.activityLog.create({
      data: {
        workspace_id: entry.workspaceId,
        actor_id: options.userId,
        entity_type: "task",
        entity_id: entry.taskId,
        action: "task_imported",
        meta_json: JSON.stringify({
          source: "import",
          fileName: options.fileName || "uploaded.csv",
          rowNumber: entry.rowNumber,
          title: entry.title,
          status: entry.status,
        }),
      },
    })
  }

  for (const entry of result.customFieldLogEntries) {
    await prisma.activityLog.create({
      data: {
        workspace_id: entry.workspaceId,
        actor_id: options.userId,
        entity_type: "task",
        entity_id: entry.taskId,
        action: "task_custom_field_set",
        meta_json: JSON.stringify({
          source: "import",
          fieldName: entry.fieldName,
          to: entry.value,
        }),
      },
    })
  }

  return {
    createdCount: result.createdTaskIds.length,
    warnings,
    projectId: result.projectId,
    createdUsers: result.createdUsers,
    createdSections: result.createdSections,
    createdCustomFields: result.createdCustomFields,
  }
}
