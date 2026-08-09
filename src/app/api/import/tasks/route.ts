import { NextResponse, type NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getDefaultWorkspaceForUser, isSuperAdminUser } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import {
  getAvailableImportCustomFields,
  importTasksFromCsv,
  previewTaskImport,
  type CustomFieldMappingInput,
  type ImportableCustomField,
} from "@/lib/task-import"

interface ImportRequestBody {
  mode: "preview" | "import"
  csvText: string
  fileName?: string
  targetType: "existing_project" | "new_project" | "personal"
  targetProjectId?: string
  workspaceId?: string
  projectName?: string
  customFieldMappings?: CustomFieldMappingInput[]
}

async function resolveTarget(userId: string, body: ImportRequestBody) {
  const isSuperAdmin = await isSuperAdminUser(userId)
  if (!isSuperAdmin) throw new Error("Only super admins can import tasks")

  if (body.targetType === "existing_project") {
    if (!body.targetProjectId) {
      throw new Error("Select a project to import into")
    }

    const project = await prisma.project.findUnique({
      where: { id: body.targetProjectId },
      select: { id: true, workspace_id: true },
    })
    if (!project) throw new Error("Target project not found")

    return { type: "existing_project" as const, projectId: project.id }
  }

  if (body.targetType === "new_project") {
    const workspaceId = body.workspaceId || (await getDefaultWorkspaceForUser(userId))?.id
    if (!workspaceId) throw new Error("No workspace available")

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })
    if (!workspace) throw new Error("Workspace not found")

    if (!body.projectName?.trim()) throw new Error("Enter a project name")

    return {
      type: "new_project" as const,
      workspaceId,
      projectName: body.projectName.trim(),
    }
  }

  const workspaceId = body.workspaceId || (await getDefaultWorkspaceForUser(userId))?.id
  if (!workspaceId) throw new Error("No workspace available")

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })
  if (!workspace) throw new Error("Workspace not found")

  return { type: "personal" as const, workspaceId }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = (await request.json()) as ImportRequestBody
    const csvText = body.csvText?.trim()
    if (!csvText) {
      return NextResponse.json({ error: "CSV content is required" }, { status: 400 })
    }

    const target = await resolveTarget(userId, body)

    let availableCustomFields: ImportableCustomField[] = []
    if (target.type === "existing_project") {
      const project = await prisma.project.findUnique({
        where: { id: target.projectId },
        select: { id: true, workspace_id: true },
      })
      if (!project) {
        return NextResponse.json({ error: "Target project not found" }, { status: 404 })
      }
      availableCustomFields = await getAvailableImportCustomFields(project.workspace_id, project.id)
    } else if (target.type === "new_project" || target.type === "personal") {
      availableCustomFields = await getAvailableImportCustomFields(target.workspaceId, null)
    }

    if (body.mode === "preview") {
      const preview = previewTaskImport(csvText)
      return NextResponse.json({ ...preview, availableCustomFields })
    }

    const result = await importTasksFromCsv({
      userId,
      csvText,
      fileName: body.fileName,
      target,
      customFieldMappings: body.customFieldMappings,
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
