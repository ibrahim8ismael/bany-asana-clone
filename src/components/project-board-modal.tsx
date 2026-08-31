"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd"
import { Calendar, CheckCircle2, FolderKanban, Plus, X } from "lucide-react"
import ProjectMembersManager, { type ProjectMemberManagementData } from "@/components/project-members-manager"
import ProjectQualityPolicySettings from "@/components/project-quality-policy-settings"
import { createTask, getProjectActivity, getProjectMemberManagement, updateProject, updateTask } from "@/actions/server-actions"
import { parseActivityMeta } from "@/lib/activity"
import { TASK_WORKFLOW_STAGES, validateManualTaskTransition } from "@/lib/workflow"

function formatProjectActivity(activity: any) {
  const actor = activity.actor?.full_name || "Someone"
  const meta = parseActivityMeta<Record<string, string | null | undefined>>(activity.meta_json)

  switch (activity.action) {
    case "project_created":
      return `${actor} created the project`
    case "project_name_changed":
      return `${actor} renamed the project`
    case "project_description_changed":
      return `${actor} updated the project description`
    case "project_deadline_changed":
      return `${actor} updated the project deadline${meta?.to ? ` to ${format(new Date(meta.to), "MMM d, yyyy")}` : ""}`
    case "project_status_changed":
      return `${actor} changed the project status${meta?.to ? ` to ${meta.to}` : ""}`
    case "project_task_added":
      return `${actor} added task${meta?.title ? ` ${meta.title}` : ""}`
    case "project_task_removed":
      return `${actor} removed task${meta?.title ? ` ${meta.title}` : ""}`
    case "project_member_added":
      return `${actor} added ${meta?.memberName ? `${meta.memberName} ` : "a member "}to the project${meta?.to ? ` as ${meta.to}` : ""}`
    case "project_member_role_changed":
      return `${actor} changed ${meta?.memberName ? `${meta.memberName}'s` : "a member's"} role${meta?.to ? ` to ${meta.to}` : ""}`
    case "project_owner_transferred":
      return `${actor} transferred project ownership${meta?.toName ? ` to ${meta.toName}` : ""}`
    case "project_member_removed":
      return `${actor} removed ${meta?.memberName ? meta.memberName : "a member"} from the project`
    case "section_created":
      return `${actor} created a section${meta?.sectionName ? `: ${meta.sectionName}` : ""}`
    case "section_deleted":
      return `${actor} deleted a section`
    default:
      return `${actor} updated the project`
  }
}

function toDateInputValue(value?: string | Date | null) {
  if (!value) return ""

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

export default function ProjectBoardModal({
  project,
  isOpen,
  onClose,
  onProjectUpdated,
  onTaskUpdated,
  onOpenTask,
}: {
  project: any | null
  isOpen: boolean
  onClose: () => void
  onProjectUpdated: (project: any) => void
  onTaskUpdated: (task: any) => void
  onOpenTask: (task: any) => void
}) {
  const [nameDraft, setNameDraft] = useState("")
  const [savingName, setSavingName] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState("")
  const [deadlineDraft, setDeadlineDraft] = useState("")
  const [savingDeadline, setSavingDeadline] = useState(false)
  const [savingDescription, setSavingDescription] = useState(false)
  const [activities, setActivities] = useState<any[]>([])
  const [memberManagement, setMemberManagement] = useState<ProjectMemberManagementData>({
    canManage: false,
    canTransferOwnership: false,
    ownerId: null,
    members: [],
    workspaceMembers: [],
  })
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [addingStatus, setAddingStatus] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [error, setError] = useState("")

  const tasksByStatus = useMemo(() => {
    if (!project) return []
    return TASK_WORKFLOW_STAGES.map((column) => ({
      ...column,
      tasks: project.tasks.filter((task: any) => task.status === column.id),
    }))
  }, [project])

  useEffect(() => {
    if (!isOpen || !project) return
    setNameDraft(project.name || "")
    setDescriptionDraft(project.description || "")
    setDeadlineDraft(toDateInputValue(project.deadline))
  }, [isOpen, project])

  useEffect(() => {
    if (!isOpen || !project) return

    let cancelled = false
    setLoadingMembers(true)

    void Promise.all([getProjectActivity(project.id), getProjectMemberManagement(project.id)]).then(([nextActivities, nextMemberManagement]) => {
      if (!cancelled) {
        setActivities(nextActivities)
        setMemberManagement(nextMemberManagement)
        setLoadingMembers(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setLoadingMembers(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [isOpen, project?.deadline, project?.description, project?.id, project?.name, project?.status, project?.tasks.length])

  if (!isOpen || !project) return null

  const handleSaveName = async () => {
    const nextName = nameDraft.trim()
    const currentName = (project.name || "").trim()

    if (!nextName) {
      setNameDraft(project.name || "")
      setError("Project name is required")
      return
    }

    if (nextName === currentName) {
      if (nameDraft !== currentName) setNameDraft(currentName)
      return
    }

    setSavingName(true)
    setError("")

    const result = await updateProject(project.id, { name: nextName })

    setSavingName(false)

    if (!result.success || !result.project) {
      setError(result.error || "Failed to save project name")
      return
    }

    setNameDraft(result.project.name)
    onProjectUpdated(result.project)
  }

  const handleSaveDescription = async () => {
    const nextDescription = descriptionDraft.trim()
    const currentDescription = (project.description || "").trim()
    if (nextDescription === currentDescription) return

    setSavingDescription(true)
    setError("")

    const result = await updateProject(project.id, { description: nextDescription })
    setSavingDescription(false)

    if (!result.success || !result.project) {
      setError(result.error || "Failed to save project description")
      return
    }

    onProjectUpdated(result.project)
  }

  const handleSaveDeadline = async (nextDeadline: string) => {
    const currentDeadline = toDateInputValue(project.deadline)
    if (nextDeadline === currentDeadline) return

    setSavingDeadline(true)
    setError("")

    const result = await updateProject(project.id, { deadline: nextDeadline || null })
    setSavingDeadline(false)

    if (!result.success || !result.project) {
      setDeadlineDraft(currentDeadline)
      setError(result.error || "Failed to save project deadline")
      return
    }

    setDeadlineDraft(toDateInputValue(result.project.deadline))
    onProjectUpdated(result.project)
  }

  const handleCreateTask = async (status: string) => {
    const title = newTaskTitle.trim()
    if (!title) {
      setAddingStatus(null)
      setNewTaskTitle("")
      return
    }

    setError("")

    const sectionId = project.sections?.[0]?.id
    const created = await createTask({
      title,
      project_id: project.id,
      section_id: sectionId,
      status: status as any,
    })

    if (!created.success || !created.task) {
      setError(created.error || "Failed to create project task")
      return
    }

    onTaskUpdated(created.task)
    setAddingStatus(null)
    setNewTaskTitle("")
  }

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const task = project.tasks.find((entry: any) => entry.id === draggableId)
    if (!task) return

    const transitionError = validateManualTaskTransition({
      from: task.status,
      to: destination.droppableId,
      qualityRequired: Boolean(task.quality_required),
      qualityState: task.quality_state || "not_required",
    })
    if (transitionError) {
      setError(transitionError)
      return
    }

    setError("")

    const updated = await updateTask(task.id, {
      status: destination.droppableId as any,
    })

    if (!updated.success || !updated.task) {
      setError(updated.error || "Failed to move task")
      return
    }

    onTaskUpdated(updated.task)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex h-dvh w-full max-w-[1400px] flex-col overflow-hidden border border-white/10 bg-[#17181a] shadow-2xl shadow-black/40 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
              <FolderKanban className="h-3.5 w-3.5 text-orange-300" />
              Project
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <input
                value={nameDraft}
                disabled={loadingMembers || !memberManagement.canManage || savingName}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => void handleSaveName()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void handleSaveName()
                    ;(event.target as HTMLInputElement).blur()
                  }

                  if (event.key === "Escape") {
                    setNameDraft(project.name || "")
                    setError("")
                    ;(event.target as HTMLInputElement).blur()
                  }
                }}
                aria-label="Project name"
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xl font-semibold text-white/90 outline-none transition-colors placeholder:text-white/25 hover:border-white/10 hover:bg-white/[0.03] focus:border-white/15 focus:bg-white/5 sm:min-w-[220px] sm:text-2xl"
              />
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${project.status === "complete" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100" : project.status === "in_progress" ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-white/10 bg-white/5 text-white/55"}`}>
                {project.status === "in_progress" ? "In Progress" : project.status}
              </span>
            </div>
            <div className="mt-2 text-xs text-white/30">{savingName ? "Saving name..." : memberManagement.canManage ? "Click the project name to rename it." : "Only project admins can change project settings."}</div>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/projects/${project.id}/${project.default_view}`} className="hidden rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex">
              Open full board
            </Link>
            <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close project preview">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 items-start gap-0 overflow-y-auto overscroll-contain custom-scrollbar xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col border-b border-white/5 xl:border-b-0 xl:border-r">
            <div className="border-b border-white/5 px-6 py-4">
              <div className="flex flex-wrap items-end gap-4 border-b border-white/5 pb-4">
                <div className="min-w-[220px] flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/25">Deadline</div>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
                    <Calendar className="h-4 w-4 text-white/45" />
                    <input
                      type="date"
                      value={deadlineDraft}
                      disabled={loadingMembers || !memberManagement.canManage || savingDeadline}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        setDeadlineDraft(nextValue)
                        void handleSaveDeadline(nextValue)
                      }}
                      className="bg-transparent text-sm text-white outline-none [color-scheme:dark]"
                    />
                  </div>
                  <div className="mt-2 text-xs text-white/30">
                    {savingDeadline
                      ? "Saving deadline..."
                      : deadlineDraft
                        ? `Project deadline is ${format(new Date(`${deadlineDraft}T12:00:00`), "MMM d, yyyy")}.`
                        : "Set an overall delivery date for this project."}
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/25">Project Description</div>
              <textarea
                value={descriptionDraft}
                disabled={loadingMembers || !memberManagement.canManage || savingDescription}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                onBlur={() => void handleSaveDescription()}
                placeholder="Write what this project is about, deliverables, scope, and expectations."
                className="mt-4 h-28 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/20 focus:border-white/20"
              />
              <div className="mt-2 text-xs text-white/30">{savingDescription ? "Saving description..." : "Project description is separate from task descriptions."}</div>
              {error ? <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
            </div>

            <div className="px-6 py-5">
              <DragDropContext onDragEnd={handleDragEnd}>
                <div className="flex w-full items-start gap-4 overflow-x-auto pb-2 custom-scrollbar">
                  {tasksByStatus.map((column) => (
                    <div key={column.id} className="flex min-h-[280px] w-[270px] shrink-0 flex-col rounded-3xl border border-white/5 bg-[#1d1e20]">
                      <div className="border-b border-white/5 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold uppercase tracking-[0.2em] text-white/70">{column.label}</div>
                            <div className="mt-1 text-xs text-white/30">Tasks whose status is currently {column.label.toLowerCase()}.</div>
                          </div>
                          <div className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-white/35">{column.tasks.length}</div>
                        </div>
                      </div>

                      <Droppable droppableId={column.id} isDropDisabled={!column.manualTransition}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className={`flex-1 space-y-3 p-4 ${snapshot.isDraggingOver ? "bg-white/[0.03]" : ""}`}>
                            {column.tasks.map((task: any, index: number) => (
                              <Draggable key={task.id} draggableId={task.id} index={index} disableInteractiveElementBlocking isDragDisabled={!memberManagement.canManage || !TASK_WORKFLOW_STAGES.some((stage) => stage.id !== task.status && !validateManualTaskTransition({ from: task.status, to: stage.id, qualityRequired: Boolean(task.quality_required), qualityState: task.quality_state || "not_required" }))}>
                                {(draggableProvided, draggableSnapshot) => (
                                  <div ref={draggableProvided.innerRef} {...draggableProvided.draggableProps} {...draggableProvided.dragHandleProps} style={draggableProvided.draggableProps.style}>
                                    <button onClick={() => onOpenTask(task)} className={`w-full rounded-2xl border border-white/5 bg-[#252628] px-4 py-3 text-left transition-colors ${draggableSnapshot.isDragging ? "rotate-1 border-white/20 shadow-2xl" : "hover:bg-[#2c2d2f]"}`}>
                                      <div className="mb-2 flex items-start justify-between gap-3">
                                        <div className={`text-sm font-medium leading-6 ${task.status === "complete" ? "text-white/35 line-through" : "text-white/85"}`}>{task.title}</div>
                                        <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${task.status === "complete" ? "fill-emerald-500 text-emerald-500" : "text-white/15"}`} />
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/35">
                                        {task.assignee?.full_name ? <span>{task.assignee.full_name}</span> : null}
                                        {task.due_date ? (
                                          <span className="inline-flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            {format(new Date(task.due_date), "MMM d")}
                                          </span>
                                        ) : null}
                                      </div>
                                    </button>
                                  </div>
                                )}
                              </Draggable>
                            ))}

                            {provided.placeholder}

                            {column.manualTransition && addingStatus === column.id ? (
                              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-3">
                                <input
                                  value={newTaskTitle}
                                  onChange={(event) => setNewTaskTitle(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") void handleCreateTask(column.id)
                                    if (event.key === "Escape") {
                                      setAddingStatus(null)
                                      setNewTaskTitle("")
                                    }
                                  }}
                                  placeholder={`Add a ${column.label.toLowerCase()} task`}
                                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                                  autoFocus
                                />
                                <div className="mt-3 flex items-center gap-2">
                                  <button onClick={() => void handleCreateTask(column.id)} className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-400">
                                    Add task
                                  </button>
                                  <button onClick={() => { setAddingStatus(null); setNewTaskTitle("") }} className="rounded-md px-3 py-1.5 text-xs font-medium text-white/45 hover:bg-white/5 hover:text-white/75">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : column.manualTransition ? (
                              <button onClick={() => setAddingStatus(column.id)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white/30 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white/60">
                                <Plus className="h-3.5 w-3.5" />
                                Add task
                              </button>
                            ) : null}

                            {column.tasks.length === 0 && addingStatus !== column.id ? (
                              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/25">
                                No tasks in this column.
                              </div>
                            ) : null}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  ))}
                </div>
              </DragDropContext>
            </div>
          </div>

          <aside className="border-l border-white/5 bg-[#141517]">
            <div className="space-y-5 p-5">
              {!loadingMembers ? (
                <ProjectQualityPolicySettings
                  key={project.id}
                  projectId={project.id}
                  initialPolicy={(project.quality_policy || "off") as "off" | "optional" | "required"}
                  initialDefaultReviewerId={project.default_reviewer_id || null}
                  initialReviewSlaDays={project.review_sla_days || 1}
                  reviewers={memberManagement.members.map((membership) => membership.user)}
                  canManage={memberManagement.canManage}
                  onSaved={(settings) => {
                    onProjectUpdated({
                      ...project,
                      quality_policy: settings.policy,
                      default_reviewer_id: settings.defaultReviewerId,
                      review_sla_days: settings.reviewSlaDays,
                    })
                    for (const task of project.tasks) {
                      if (task.parent_task_id || task.status === "complete" || ["submitted", "needs_rework", "approved", "approved_with_notes"].includes(task.quality_state)) continue
                      onTaskUpdated({
                        ...task,
                        quality_required: settings.policy === "required",
                        quality_state: settings.policy === "required" ? "ready" : "not_required",
                      })
                    }
                  }}
                />
              ) : null}
              {loadingMembers ? (
                <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-4 text-sm text-white/35">Loading members...</div>
              ) : (
                <ProjectMembersManager
                  projectId={project.id}
                  canManage={memberManagement.canManage}
                  canTransferOwnership={memberManagement.canTransferOwnership}
                  ownerId={memberManagement.ownerId}
                  members={memberManagement.members}
                  workspaceMembers={memberManagement.workspaceMembers}
                  layout="compact"
                  reloadData={() => getProjectMemberManagement(project.id)}
                />
              )}

              <div className="rounded-[24px] border border-white/5 bg-white/[0.03]">
                <div className="border-b border-white/5 px-5 py-4">
                  <div className="text-sm font-bold uppercase tracking-[0.2em] text-white/70">Project Changelog</div>
                  <p className="mt-1 text-xs text-white/30">A project-level activity stream, separate from individual task history.</p>
                </div>

                <div className="space-y-3 p-4">
                  {activities.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/25">
                      No project changes recorded yet.
                    </div>
                  ) : (
                    activities.map((activity) => (
                      <div key={activity.id} className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                        <div className="text-sm leading-6 text-white/80">{formatProjectActivity(activity)}</div>
                        <div className="mt-2 text-[11px] text-white/30">{format(new Date(activity.created_at), "MMM d, h:mm a")}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
