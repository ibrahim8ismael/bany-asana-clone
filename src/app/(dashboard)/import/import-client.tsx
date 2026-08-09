"use client"

import { useMemo, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { Upload, FileSpreadsheet, Download, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type {
  CustomFieldMappingInput,
  ImportableCustomField,
  SupportedCustomFieldType,
} from "@/lib/task-import"

type TargetType = "existing_project" | "new_project" | "personal"

interface WorkspaceOption {
  id: string
  name: string
}

interface ProjectOption {
  id: string
  name: string
  workspace_id: string
}

interface PreviewResponse {
  headers: string[]
  totalRows: number
  validRows: number
  previewRows: Array<{
    rowNumber: number
    title: string
    status: string
    assignee: string | null
    section: string | null
    dueDate: string | null
    parentTask: string | null
  }>
  warnings: string[]
  detectedSections: string[]
  customFieldCandidates: Array<{
    header: string
    inferredType: SupportedCustomFieldType
    sampleValues: string[]
  }>
  availableCustomFields: ImportableCustomField[]
}

interface MappingState {
  action: CustomFieldMappingInput["action"]
  fieldName: string
  fieldType: SupportedCustomFieldType
  customFieldId: string
}

export default function ImportClient({
  workspaces,
  projects,
  initialProjectId,
  initialTargetType,
}: {
  workspaces: WorkspaceOption[]
  projects: ProjectOption[]
  initialProjectId: string | null
  initialTargetType: TargetType
}) {
  const [csvText, setCsvText] = useState("")
  const [fileName, setFileName] = useState("")
  const [targetType, setTargetType] = useState<TargetType>(initialTargetType)
  const [targetProjectId, setTargetProjectId] = useState(initialProjectId || projects[0]?.id || "")
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "")
  const [projectName, setProjectName] = useState("Imported Tasks")
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [customFieldMappings, setCustomFieldMappings] = useState<Record<string, MappingState>>({})
  const [error, setError] = useState("")
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const [successHref, setSuccessHref] = useState<string | null>(null)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === targetProjectId) || null,
    [projects, targetProjectId]
  )

  const requestBody = {
    csvText,
    fileName,
    targetType,
    targetProjectId,
    workspaceId: targetType === "existing_project" ? selectedProject?.workspace_id : workspaceId,
    projectName,
    customFieldMappings: Object.entries(customFieldMappings).map(([header, mapping]) => ({
      header,
      action: mapping.action,
      fieldName: mapping.fieldName,
      fieldType: mapping.fieldType,
      customFieldId: mapping.customFieldId,
    })),
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setCsvText(await file.text())
    setSuccessMessage("")
    setSuccessHref(null)
    setError("")
  }

  const readResponsePayload = async (response: Response) => {
    const text = await response.text()
    if (!text) return null

    try {
      return JSON.parse(text)
    } catch {
      return { error: text }
    }
  }

  const initializeMappings = (payload: PreviewResponse) => {
    const nextMappings: Record<string, MappingState> = {}

    for (const candidate of payload.customFieldCandidates) {
      const matchingField = payload.availableCustomFields.find(
        (field) => field.name.trim().toLowerCase() === candidate.header.trim().toLowerCase()
      )

      nextMappings[candidate.header] = matchingField
        ? {
            action: "map",
            fieldName: matchingField.name,
            fieldType: (matchingField.type as SupportedCustomFieldType) || candidate.inferredType,
            customFieldId: matchingField.id,
          }
        : {
            action: "create",
            fieldName: candidate.header,
            fieldType: candidate.inferredType,
            customFieldId: "",
          }
    }

    setCustomFieldMappings(nextMappings)
  }

  const handlePreview = async () => {
    if (!csvText.trim()) {
      setError("Upload a CSV file first.")
      return
    }

    setIsPreviewing(true)
    setError("")
    setSuccessMessage("")
    setSuccessHref(null)

    const response = await fetch("/api/import/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...requestBody, mode: "preview" }),
    })

    const payload = await readResponsePayload(response)
    if (!response.ok) {
      setError(payload?.error || "Preview failed")
      setPreview(null)
    } else if (payload) {
      setPreview(payload)
      initializeMappings(payload)
    } else {
      setError("Preview failed: empty server response")
      setPreview(null)
    }

    setIsPreviewing(false)
  }

  const handleImport = async () => {
    if (!csvText.trim()) {
      setError("Upload a CSV file first.")
      return
    }

    setIsImporting(true)
    setError("")
    setSuccessMessage("")
    setSuccessHref(null)

    const response = await fetch("/api/import/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...requestBody, mode: "import" }),
    })

    const payload = await readResponsePayload(response)
    if (!response.ok) {
      setError(payload?.error || "Import failed")
    } else if (payload) {
      setSuccessMessage(
        `Imported ${payload.createdCount} tasks successfully. Created ${payload.createdUsers} users, ${payload.createdSections} sections, and ${payload.createdCustomFields} custom fields.`
      )
      setSuccessHref(payload.projectId ? `/projects/${payload.projectId}/list` : "/my-tasks")
      setPreview((current) =>
        current ? { ...current, warnings: payload.warnings || current.warnings } : current
      )
    } else {
      setError("Import failed: empty server response")
    }

    setIsImporting(false)
  }

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar bg-[#1e1f21]">
      <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Upload className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-white/90">Import CSV</h1>
              <p className="text-sm text-white/40 mt-1">Bring project tasks or personal tasks into TaskFlow.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/api/export/my-tasks" className="px-3 py-2 rounded-md border border-white/10 text-white/70 hover:bg-white/5 text-sm inline-flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export my tasks
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-white/5 bg-[#262729] p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">CSV file</label>
              <input type="file" accept=".csv,text/csv" onChange={handleFileChange} className="block w-full text-sm text-white/70 file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-500" />
              {fileName ? <p className="text-xs text-white/35">Loaded file: {fileName}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Or paste CSV content</label>
              <textarea
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
                placeholder="Paste CSV content here..."
                className="min-h-[220px] w-full rounded-xl border border-white/10 bg-[#1f2022] px-4 py-3 text-sm text-white/80 outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handlePreview} disabled={isPreviewing || !csvText.trim()}>
                <FileSpreadsheet className="w-4 h-4" />
                {isPreviewing ? "Previewing..." : "Preview import"}
              </Button>
              <Button variant="outline" onClick={handleImport} disabled={isImporting || !csvText.trim()}>
                <Upload className="w-4 h-4" />
                {isImporting ? "Importing..." : "Import now"}
              </Button>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
            ) : null}

            {successMessage ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 space-y-2">
                <div>{successMessage}</div>
                {successHref ? (
                  <Link href={successHref} className="inline-flex text-emerald-100 underline underline-offset-4">
                    Open imported tasks
                  </Link>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/5 bg-[#262729] p-6 space-y-5">
            <h2 className="text-lg font-semibold text-white/85">Import target</h2>

            <div className="space-y-2">
              <label className="text-sm text-white/70">Import into</label>
              <select value={targetType} onChange={(event) => setTargetType(event.target.value as TargetType)} className="w-full rounded-lg border border-white/10 bg-[#1f2022] px-3 py-2 text-sm text-white/80 outline-none">
                <option value="existing_project">Existing project</option>
                <option value="new_project">New project</option>
                <option value="personal">Personal tasks</option>
              </select>
            </div>

            {targetType === "existing_project" ? (
              <div className="space-y-2">
                <label className="text-sm text-white/70">Project</label>
                <select value={targetProjectId} onChange={(event) => setTargetProjectId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#1f2022] px-3 py-2 text-sm text-white/80 outline-none">
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>
            ) : null}

            {targetType !== "existing_project" ? (
              <div className="space-y-2">
                <label className="text-sm text-white/70">Workspace</label>
                <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#1f2022] px-3 py-2 text-sm text-white/80 outline-none">
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                  ))}
                </select>
              </div>
            ) : null}

            {targetType === "new_project" ? (
              <div className="space-y-2">
                <label className="text-sm text-white/70">New project name</label>
                <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="bg-[#1f2022] border-white/10 text-white/80" />
              </div>
            ) : null}

            <div className="rounded-xl border border-white/5 bg-[#1f2022] px-4 py-4 text-sm text-white/50 space-y-2">
              <p className="font-medium text-white/70">Import behavior</p>
              <ul className="space-y-1 list-disc pl-4">
                <li>Create-only import; existing tasks are not updated.</li>
                <li>Only super admins can import CSV data.</li>
                <li>Unknown assignees with emails are created automatically as placeholder users.</li>
                <li>Personal imports reassign all imported tasks to the current super admin so they appear in My Tasks.</li>
                <li>Missing sections and tags are created automatically.</li>
              </ul>
            </div>
          </section>
        </div>

        {preview ? (
          <section className="rounded-2xl border border-white/5 bg-[#262729] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white/85">Preview</h2>
                <p className="text-sm text-white/40 mt-1">{preview.validRows} rows ready from {preview.totalRows} parsed rows.</p>
              </div>
              <div className="text-xs text-white/35">Detected columns: {preview.headers.join(", ")}</div>
            </div>

            {preview.warnings.length > 0 ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 space-y-1">
                <div className="flex items-center gap-2 font-medium"><AlertCircle className="w-4 h-4" /> Warnings</div>
                {preview.warnings.slice(0, 12).map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            ) : null}

            <div className="overflow-auto rounded-xl border border-white/5">
              <table className="min-w-full text-sm">
                <thead className="bg-[#1f2022] text-white/50">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Assignee</th>
                    <th className="px-3 py-2 text-left">Section</th>
                    <th className="px-3 py-2 text-left">Due date</th>
                    <th className="px-3 py-2 text-left">Parent</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.previewRows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.title}`} className="border-t border-white/5 text-white/75">
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2">{row.title}</td>
                      <td className="px-3 py-2 capitalize">{row.status.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2">{row.assignee || "-"}</td>
                      <td className="px-3 py-2">{row.section || "Imported"}</td>
                      <td className="px-3 py-2">{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : "-"}</td>
                      <td className="px-3 py-2">{row.parentTask || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.customFieldCandidates.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-white/85">Custom field mapping</h3>
                  <p className="text-sm text-white/40 mt-1">Map extra Asana columns to existing or new custom fields before importing.</p>
                </div>

                <div className="space-y-3">
                  {preview.customFieldCandidates.map((candidate) => {
                    const mapping = customFieldMappings[candidate.header]
                    if (!mapping) return null

                    return (
                      <div key={candidate.header} className="rounded-xl border border-white/5 bg-[#1f2022] p-4 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-medium text-white/85">{candidate.header}</div>
                            <div className="text-xs text-white/35 mt-1">Detected type: {candidate.inferredType.replace("_", " ")}</div>
                          </div>
                          <div className="text-xs text-white/35 max-w-sm text-right">Sample values: {candidate.sampleValues.join(", ") || "-"}</div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="space-y-1">
                            <label className="text-xs text-white/50">Action</label>
                            <select
                              value={mapping.action}
                              onChange={(event) =>
                                setCustomFieldMappings((current) => ({
                                  ...current,
                                  [candidate.header]: {
                                    ...current[candidate.header],
                                    action: event.target.value as MappingState["action"],
                                  },
                                }))
                              }
                              className="w-full rounded-lg border border-white/10 bg-[#262729] px-3 py-2 text-sm text-white/80 outline-none"
                            >
                              <option value="create">Create new field</option>
                              <option value="map">Map to existing field</option>
                              <option value="ignore">Ignore this column</option>
                            </select>
                          </div>

                          {mapping.action === "create" ? (
                            <>
                              <div className="space-y-1">
                                <label className="text-xs text-white/50">Field name</label>
                                <Input
                                  value={mapping.fieldName}
                                  onChange={(event) =>
                                    setCustomFieldMappings((current) => ({
                                      ...current,
                                      [candidate.header]: {
                                        ...current[candidate.header],
                                        fieldName: event.target.value,
                                      },
                                    }))
                                  }
                                  className="bg-[#262729] border-white/10 text-white/80"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-white/50">Field type</label>
                                <select
                                  value={mapping.fieldType}
                                  onChange={(event) =>
                                    setCustomFieldMappings((current) => ({
                                      ...current,
                                      [candidate.header]: {
                                        ...current[candidate.header],
                                        fieldType: event.target.value as SupportedCustomFieldType,
                                      },
                                    }))
                                  }
                                  className="w-full rounded-lg border border-white/10 bg-[#262729] px-3 py-2 text-sm text-white/80 outline-none"
                                >
                                  <option value="text">Text</option>
                                  <option value="number">Number</option>
                                  <option value="date">Date</option>
                                  <option value="checkbox">Checkbox</option>
                                  <option value="single_select">Single select</option>
                                </select>
                              </div>
                            </>
                          ) : null}

                          {mapping.action === "map" ? (
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-xs text-white/50">Existing field</label>
                              <select
                                value={mapping.customFieldId}
                                onChange={(event) =>
                                  setCustomFieldMappings((current) => ({
                                    ...current,
                                    [candidate.header]: {
                                      ...current[candidate.header],
                                      customFieldId: event.target.value,
                                    },
                                  }))
                                }
                                className="w-full rounded-lg border border-white/10 bg-[#262729] px-3 py-2 text-sm text-white/80 outline-none"
                              >
                                <option value="">Select existing field</option>
                                {preview.availableCustomFields.map((field) => (
                                  <option key={field.id} value={field.id}>
                                    {field.name} ({field.type})
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  )
}
