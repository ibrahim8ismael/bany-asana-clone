"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import {
  addTaskAttachment,
  createSubtask,
  deleteTask,
  deleteSubtask,
  deleteTaskAttachment,
  getAssignableUsers,
  getTaskActivity,
  getTaskCapabilities,
  getUserClients,
  getUserProjects,
  toggleSubtaskStatus,
  updateTask,
} from "@/actions/server-actions"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import TaskComments from "@/components/task-comments"
import TaskQualityPanel from "@/components/task-quality-panel"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import TaskSelectMenu, { TaskSelectOption } from "@/components/task-select-menu"
import { describeTaskHistory } from "@/lib/task-history"
import { TASK_WORKFLOW_STAGES, validateManualTaskTransition } from "@/lib/workflow"
import {
  Briefcase,
  Calendar,
  CheckCircle2,
  FolderKanban,
  Link as LinkIcon,
  Paperclip,
  Plus,
  Trash2,
  User,
  X,
} from "lucide-react"

const priorityOptions = ["high", "medium", "low"] as const
const priorityStyles: Record<string, string> = {
  high: "bg-red-500/20 text-red-300 border-red-500/30",
  medium: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/30",
}

interface DrawerUser {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
}

interface DrawerComment {
  id: string
  body_rich_text: string
  created_at?: string | Date | null
  author?: DrawerUser | null
}

interface DrawerAttachment {
  id: string
  file_name: string
  file_url: string
}

interface DrawerSubtask {
  id: string
  title: string
  status: string
}

interface DrawerActivity {
  id: string
  action: string
  created_at: string | Date
  actor?: DrawerUser | null
  meta_json?: string | null
}

interface DrawerTask {
  id: string
  title: string
  status: string
  priority?: string | null
  due_date?: string | Date | null
  description_rich_text?: string | null
  assignee_id?: string | null
  creator_id?: string | null
  reviewer_id?: string | null
  project_id?: string | null
  client_id?: string | null
  section_id?: string | null
  workspace_id?: string
  quality_required?: boolean
  quality_state?: string
  quality_score?: number | null
  first_quality_grade?: string | null
  final_quality_grade?: string | null
  rework_count?: number
  quality_blocker_count?: number
  comments?: DrawerComment[]
  attachments?: DrawerAttachment[]
  subtasks?: DrawerSubtask[]
  assignee?: DrawerUser | null
  project?: {
    id: string
    name: string
    color?: string | null
  } | null
  client?: {
    id: string
    name: string
    color?: string | null
    email?: string | null
  } | null
}

interface DrawerProject {
  id: string
  name: string
  color: string | null
  client_id?: string | null
  client?: {
    id: string
    name: string
  } | null
}

interface DrawerClient {
  id: string
  name: string
  color: string | null
  email?: string | null
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

export default function TaskDrawer({
  task,
  isOpen,
  onClose,
  onTaskUpdated,
}: {
  task: DrawerTask | null
  isOpen: boolean
  onClose: () => void
  onTaskUpdated?: (task: DrawerTask) => void
}) {
  const router = useRouter()
  const { data: session } = useSession()
  const [descriptionDraft, setDescriptionDraft] = useState(task?.description_rich_text || "")
  const [isCompleting, setIsCompleting] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [localTask, setLocalTask] = useState<DrawerTask | null>(task)
  const [saveError, setSaveError] = useState("")
  const [savingField, setSavingField] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState(task?.title || "")
  const [userProjects, setUserProjects] = useState<DrawerProject[]>([])
  const [userClients, setUserClients] = useState<DrawerClient[]>([])
  const [assignableUsers, setAssignableUsers] = useState<DrawerUser[]>([])
  const [activities, setActivities] = useState<DrawerActivity[]>([])
  const [attachmentName, setAttachmentName] = useState("")
  const [attachmentUrl, setAttachmentUrl] = useState("")
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("")
  const [canManageTask, setCanManageTask] = useState(false)

  const displayTask = localTask ?? task
  const projectOptions: TaskSelectOption[] = userProjects.map((project) => ({
    id: project.id,
    label: project.name,
    description: project.client?.name || null,
    color: project.color,
  }))
  const clientOptions: TaskSelectOption[] = userClients.map((client) => ({
    id: client.id,
    label: client.name,
    description: client.email || null,
    color: client.color,
  }))
  const assigneeOptions: TaskSelectOption[] = assignableUsers.map((user) => ({
    id: user.id,
    label: user.full_name,
    description: user.email,
    avatarUrl: user.avatar_url,
  }))

  useEffect(() => {
    setLocalTask(task)
    setTitleDraft(task?.title || "")
    setDescriptionDraft(task?.description_rich_text || "")
    setSaveError("")
    setSavingField(null)
    setIsEditingTitle(false)
  }, [task])

  useEffect(() => {
    if (!isOpen || !task?.id) return
    setCanManageTask(false)

    void Promise.all([getUserProjects(), getUserClients(), getAssignableUsers(task.id), getTaskActivity(task.id), getTaskCapabilities(task.id)]).then(
      ([projects, clients, users, activity, capabilities]) => {
        setUserProjects(projects)
        setUserClients(clients)
        setAssignableUsers(users)
        setActivities(activity as DrawerActivity[])
        setCanManageTask(capabilities.canManage)
      }
    )
  }, [isOpen, task?.id])

  if (!displayTask) return null

  const applyUpdatedTask = (updatedTask: DrawerTask) => {
    setLocalTask(updatedTask)
    setTitleDraft(updatedTask.title)
    setDescriptionDraft(updatedTask.description_rich_text || "")
    onTaskUpdated?.(updatedTask)
  }

  const refreshActivity = async (taskId: string) => {
    const nextActivity = await getTaskActivity(taskId)
    setActivities(nextActivity as DrawerActivity[])
  }

  const persistTaskUpdate = async (
    field: string,
    updates: {
      title?: string
      description_rich_text?: string | null
        status?: string
        priority?: string
        due_date?: string | null
        assignee_id?: string | null
        project_id?: string | null
        client_id?: string | null
        section_id?: string | null
      }
  ) => {
    setSavingField(field)
    setSaveError("")

    const result = await updateTask(displayTask.id, updates)

    if (result.success && result.task) {
      applyUpdatedTask(result.task as DrawerTask)
      await refreshActivity(displayTask.id)
    } else {
      setSaveError(result.error || "Failed to save task changes")
      setTitleDraft(displayTask.title)
      setDescriptionDraft(displayTask.description_rich_text || "")
    }

    setSavingField(null)
  }

  const handleTitleSave = async () => {
    const nextTitle = titleDraft.trim()

    if (!nextTitle) {
      setTitleDraft(displayTask.title)
      setIsEditingTitle(false)
      return
    }

    if (nextTitle !== displayTask.title) {
      await persistTaskUpdate("title", { title: nextTitle })
    }

    setIsEditingTitle(false)
  }

  const handleDescriptionSave = async () => {
    const nextDescription = descriptionDraft.trim()
    const currentDescription = displayTask.description_rich_text || ""

    if (nextDescription === currentDescription.trim()) return

    await persistTaskUpdate("description", {
      description_rich_text: nextDescription || null,
    })
  }

  const handleMarkComplete = async () => {
    if (displayTask.quality_required) return
    setIsCompleting(true)
    const newStatus = displayTask.status === "complete" ? "incomplete" : "complete"
    await persistTaskUpdate("status", { status: newStatus })
    setIsCompleting(false)
  }

  const isComplete = displayTask.status === "complete"
  const qualityActionLabel = displayTask.quality_state === "submitted"
    ? "In quality review"
    : displayTask.quality_state === "needs_rework"
      ? "Needs rework"
      : displayTask.quality_state === "approved" || displayTask.quality_state === "approved_with_notes"
        ? "Quality approved"
        : "Submit for review below"

  const handleCreateSubtask = async () => {
    const title = newSubtaskTitle.trim()
    if (!title) return

    const result = await createSubtask(displayTask.id, title)
    if (result.success && result.subtask) {
      applyUpdatedTask({
        ...displayTask,
        subtasks: [...(displayTask.subtasks || []), result.subtask as DrawerSubtask],
      })
      setNewSubtaskTitle("")
      await refreshActivity(displayTask.id)
    } else {
      setSaveError(result.error || "Failed to create subtask")
    }
  }

  const handleToggleSubtask = async (subtaskId: string) => {
    const result = await toggleSubtaskStatus(subtaskId)
    if (result.success && result.subtask) {
      applyUpdatedTask({
        ...displayTask,
        subtasks: (displayTask.subtasks || []).map((subtask) =>
          subtask.id === subtaskId ? (result.subtask as DrawerSubtask) : subtask
        ),
      })
      await refreshActivity(displayTask.id)
    }
  }

  const handleDeleteSubtask = async (subtaskId: string) => {
    const result = await deleteSubtask(subtaskId)
    if (result.success) {
      applyUpdatedTask({
        ...displayTask,
        subtasks: (displayTask.subtasks || []).filter((subtask) => subtask.id !== subtaskId),
      })
      await refreshActivity(displayTask.id)
    }
  }

  const handleAddAttachment = async () => {
    const fileName = attachmentName.trim()
    const fileUrl = attachmentUrl.trim()
    if (!fileName || !fileUrl) return

    const result = await addTaskAttachment(displayTask.id, {
      file_name: fileName,
      file_url: fileUrl,
    })

    if (result.success && result.task) {
      applyUpdatedTask(result.task as DrawerTask)
      setAttachmentName("")
      setAttachmentUrl("")
      await refreshActivity(displayTask.id)
    } else {
      setSaveError(result.error || "Failed to add attachment")
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    const result = await deleteTaskAttachment(attachmentId)
    if (result.success && result.task) {
      applyUpdatedTask(result.task as DrawerTask)
      await refreshActivity(displayTask.id)
    }
  }

  const handleDeleteTask = async () => {
    if (!window.confirm(`Delete “${displayTask.title}”? This cannot be undone.`)) return
    const result = await deleteTask(displayTask.id)
    if (!result.success) {
      setSaveError(result.error || "Failed to delete task")
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-hidden border-l border-[#3f3f46] bg-[#202023] p-0 text-[#f4f4f5] sm:max-w-2xl">
        <div className="flex h-full flex-col">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#3f3f46] bg-[#202023] px-5 py-3">
            <button
              disabled={isCompleting || displayTask.quality_required}
              onClick={handleMarkComplete}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm transition-all ${
                isComplete
                  ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                  : "border border-[#3f3f46] bg-[#18181b] text-[#f4f4f5] hover:border-emerald-500/50 hover:text-emerald-400"
              }`}
            >
              <CheckCircle2 className={`h-4 w-4 ${isComplete ? "fill-emerald-400 text-emerald-950" : ""}`} />
              {displayTask.quality_required ? qualityActionLabel : isComplete ? "Completed" : "Mark Complete"}
            </button>
            <div className="flex items-center gap-1">
              {canManageTask ? (
                <button
                  onClick={() => void handleDeleteTask()}
                  className="rounded-md p-1.5 text-[#a1a1aa] transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                  aria-label="Delete task"
                  title="Delete task"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-4 custom-scrollbar sm:p-6 bg-[#202023]">
            <div className="space-y-2 pt-1">
              <input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onFocus={() => setIsEditingTitle(true)}
                onBlur={() => void handleTitleSave()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void handleTitleSave()
                  }

                  if (event.key === "Escape") {
                    setTitleDraft(displayTask.title)
                    setIsEditingTitle(false)
                  }
                }}
                placeholder="Task title"
                className={`w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-xl font-bold leading-snug text-[#f4f4f5] outline-none transition-colors placeholder:text-[#a1a1aa] hover:border-[#3f3f46] focus:border-[#0075de] focus:bg-[#18181b] ${
                  isComplete ? "line-through text-[#71717a]" : ""
                }`}
              />
              <div className="flex min-h-5 items-center gap-2 px-2 text-xs">
                {savingField === "title" && <span className="text-[#a1a1aa]">Saving title...</span>}
                {isEditingTitle && savingField !== "title" && <span className="text-[#a1a1aa]">Press Enter to save</span>}
                {saveError && <span className="text-rose-400 font-semibold">{saveError}</span>}
              </div>
            </div>

            <TaskQualityPanel
              task={displayTask}
              users={assignableUsers}
              onTaskUpdated={(updates) => applyUpdatedTask({ ...displayTask, ...updates })}
              onActivityRefresh={() => refreshActivity(displayTask.id)}
            />

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[6rem_minmax(0,280px)] sm:gap-4">
                <span className="text-gray-400">Assignee</span>
                <div className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5">
                  <User className="h-4 w-4 shrink-0 text-gray-400" />
                  <TaskSelectMenu
                    value={displayTask.assignee_id || null}
                    options={assigneeOptions}
                    placeholder="Unassigned"
                    searchPlaceholder="Search teammates"
                    emptyLabel="No teammates found"
                    onChange={(nextValue) =>
                      void persistTaskUpdate("assignee", {
                        assignee_id: nextValue,
                      })
                    }
                    renderLeading={(option) => (
                      <img
                        src={option.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(option.label)}&size=40`}
                        alt={option.label}
                        className="h-6 w-6 rounded-full border border-gray-200 object-cover"
                      />
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[6rem_minmax(0,280px)] sm:gap-4">
                <span className="text-gray-400">Client</span>
                <div className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5">
                  <Briefcase className="h-4 w-4 shrink-0 text-gray-400" />
                  <TaskSelectMenu
                    value={displayTask.client_id || null}
                    options={clientOptions}
                    placeholder="No Client"
                    searchPlaceholder="Search clients"
                    emptyLabel="No clients found"
                    onChange={(nextValue) => {
                      if (displayTask.project_id) {
                        void persistTaskUpdate("client", nextValue ? { project_id: null, client_id: nextValue, section_id: null } : { project_id: null, client_id: null })
                        return
                      }

                      void persistTaskUpdate("client", nextValue ? { client_id: nextValue, section_id: null } : { client_id: null })
                    }}
                    renderLeading={(option) => (
                      <span
                        className="h-3 w-3 rounded-full border border-white/20"
                        style={{ backgroundColor: option.color || "#f06a6a" }}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[6rem_minmax(0,280px)] sm:gap-4">
                <span className="text-gray-400">Project</span>
                <div className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5">
                  <FolderKanban className="h-4 w-4 shrink-0 text-gray-400" />
                  <TaskSelectMenu
                    value={displayTask.project_id || null}
                    options={projectOptions}
                    placeholder="No Project"
                    searchPlaceholder="Search projects"
                    emptyLabel="No projects found"
                    onChange={(nextValue) =>
                      void persistTaskUpdate("project", nextValue ? { project_id: nextValue, section_id: null } : { project_id: null, section_id: null, client_id: displayTask.client_id || null })
                    }
                    renderLeading={(option) => (
                      <span
                        className="h-3 w-3 rounded-full border border-white/20"
                        style={{ backgroundColor: option.color || "#6366f1" }}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[6rem_minmax(0,280px)] sm:gap-4">
                <span className="text-gray-400">Due date</span>
                <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-zinc-900">
                  <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
                  <input
                    type="date"
                    value={toDateInputValue(displayTask.due_date)}
                    onChange={(event) =>
                      void persistTaskUpdate("due_date", {
                        due_date: event.target.value || null,
                      })
                    }
                    className="min-w-0 max-w-full bg-transparent text-sm font-medium text-gray-700 outline-none dark:text-gray-200"
                  />
                  {displayTask.due_date && (
                    <span className="text-xs text-gray-400">
                      {format(new Date(displayTask.due_date), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[6rem_minmax(0,280px)] sm:gap-4">
                <span className="text-gray-400">Priority</span>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {priorityOptions.map((priority) => (
                    <button
                      key={priority}
                      onClick={() => void persistTaskUpdate("priority", { priority })}
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                        displayTask.priority === priority
                          ? priorityStyles[priority]
                          : "border-gray-200 bg-transparent text-gray-400 hover:border-gray-300 dark:border-zinc-700"
                      }`}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[6rem_minmax(0,280px)] sm:gap-4">
                <span className="text-gray-400">Status</span>
                  <select
                    title="Status"
                    aria-label="Select status"
                    value={displayTask.status}
                    onChange={(event) =>
                      void persistTaskUpdate("status", {
                        status: event.target.value,
                      })
                    }
                    className="rounded border border-gray-200 bg-transparent px-2 py-1 text-xs font-medium capitalize text-gray-700 outline-none dark:border-zinc-700 dark:text-gray-200"
                  >
                    {TASK_WORKFLOW_STAGES.map((stage) => (
                      <option
                        key={stage.id}
                        value={stage.id}
                        disabled={stage.id !== displayTask.status && Boolean(validateManualTaskTransition({
                          from: displayTask.status,
                          to: stage.id,
                          qualityRequired: Boolean(displayTask.quality_required),
                          qualityState: displayTask.quality_state || "not_required",
                        }))}
                      >
                        {stage.label}
                      </option>
                    ))}
                  </select>
                  {displayTask.quality_required ? <span className="text-[10px] text-amber-500">Quality stages use the review controls.</span> : null}
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Description</h4>
              <textarea
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                onBlur={() => void handleDescriptionSave()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault()
                    void handleDescriptionSave()
                  }
                }}
                placeholder="Add a description..."
                className="min-h-[110px] w-full rounded-md border border-transparent bg-transparent p-3 text-sm leading-relaxed text-gray-600 outline-none transition-colors placeholder:text-gray-400 hover:border-gray-200 hover:bg-gray-50/50 focus:border-blue-400 focus:bg-blue-50/30 dark:text-gray-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/50 dark:focus:border-blue-500"
              />
              <div className="min-h-5 text-xs text-gray-400">
                {savingField === "description" && "Saving description..."}
              </div>
            </div>

            <hr className="border-gray-100 dark:border-zinc-800" />

            <div className="grid gap-6 md:grid-cols-2">
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Subtasks</h4>
                  <span className="text-xs text-gray-400">{displayTask.subtasks?.length || 0}</span>
                </div>

                <div className="space-y-2">
                  {(displayTask.subtasks || []).map((subtask) => (
                    <div key={subtask.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-zinc-800">
                      <button onClick={() => void handleToggleSubtask(subtask.id)} className="shrink-0 text-gray-400 hover:text-green-500" aria-label="Toggle subtask status">
                        <CheckCircle2 className={`h-4 w-4 ${subtask.status === "complete" ? "fill-green-500 text-green-500" : ""}`} />
                      </button>
                      <span className={`min-w-0 flex-1 break-words text-sm ${subtask.status === "complete" ? "line-through text-gray-400" : "text-gray-700 dark:text-gray-200"}`}>
                        {subtask.title}
                      </span>
                      <button onClick={() => void handleDeleteSubtask(subtask.id)} className="shrink-0 text-gray-400 hover:text-red-500" aria-label="Delete subtask">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 dark:border-zinc-800 px-3 py-2">
                    <Plus className="h-4 w-4 text-gray-400" />
                    <input
                      value={newSubtaskTitle}
                      onChange={(event) => setNewSubtaskTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void handleCreateSubtask()
                        }
                      }}
                      placeholder="Add subtask"
                      className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none dark:text-gray-200"
                    />
                    <Button size="sm" variant="outline" onClick={handleCreateSubtask}>Add</Button>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Attachments</h4>
                  <span className="text-xs text-gray-400">{displayTask.attachments?.length || 0}</span>
                </div>

                <div className="space-y-2">
                  {(displayTask.attachments || []).map((attachment) => (
                    <div key={attachment.id} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-zinc-800 px-3 py-2">
                      <Paperclip className="h-4 w-4 text-gray-400" />
                      <a href={attachment.file_url} target="_blank" rel="noreferrer" className="flex-1 text-sm text-blue-600 dark:text-blue-300 hover:underline truncate">
                        {attachment.file_name}
                      </a>
                      <button onClick={() => void handleDeleteAttachment(attachment.id)} className="text-gray-400 hover:text-red-500" aria-label="Delete attachment">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  <div className="rounded-lg border border-dashed border-gray-200 dark:border-zinc-800 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4 text-gray-400" />
                      <input
                        value={attachmentName}
                        onChange={(event) => setAttachmentName(event.target.value)}
                        placeholder="Link title"
                        className="flex-1 bg-transparent text-sm outline-none text-gray-700 dark:text-gray-200"
                      />
                    </div>
                    <input
                      value={attachmentUrl}
                      onChange={(event) => setAttachmentUrl(event.target.value)}
                      placeholder="https://..."
                      className="w-full bg-transparent text-sm outline-none text-gray-700 dark:text-gray-200"
                    />
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={handleAddAttachment}>Attach link</Button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <hr className="border-gray-100 dark:border-zinc-800" />

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">History</h4>
                <span className="text-xs text-gray-400">{activities.length}</span>
              </div>

              <div className="space-y-2">
                {activities.length === 0 ? (
                  <p className="text-sm text-gray-400">No recorded activity yet.</p>
                ) : (
                  activities.map((activity) => {
                    const description = describeTaskHistory(activity)

                    return (
                      <div key={activity.id} className="rounded-lg border border-gray-200 dark:border-zinc-800 px-3 py-3 text-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="text-gray-800 dark:text-gray-100 font-medium">{description.title}</div>
                            {description.detail ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400 break-words">{description.detail}</div>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-400 shrink-0">{format(new Date(activity.created_at), "MMM d, h:mm a")}</div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            <TaskComments 
              taskId={displayTask.id} 
              initialComments={displayTask.comments || []} 
              currentUserId={session?.user ? (session.user as { id?: string }).id || null : null} 
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
