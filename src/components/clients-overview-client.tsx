"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { format, isPast, isToday } from "date-fns"
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd"
import {
  AlertTriangle,
  Archive,
  ArrowUpCircle,
  Briefcase,
  Calendar,
  ChevronDown,
  CheckCircle2,
  FolderKanban,
  Mail,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserPlus,
  X,
} from "lucide-react"
import { convertDirectTaskToProject, createTask, deleteClient, setClientArchived, updateProject, updateTask } from "@/actions/server-actions"
import type { EditableClient } from "@/components/create-client-modal"
import AddClientMemberModal, { type ClientMember } from "@/components/add-client-member-modal"

const CreateClientModal = dynamic(() => import("@/components/create-client-modal"), { ssr: false })
const CreateProjectModal = dynamic(() => import("@/components/create-project-modal"), { ssr: false })
const TaskDrawer = dynamic(() => import("@/components/task-drawer"), { ssr: false })

type BoardFilter = "all" | "projects" | "direct" | "overdue"
type ClientScope = "active" | "archived"

const STATUS_COLUMNS = [
  { id: "incomplete", name: "To Do", accent: "bg-zinc-400", taskOnly: false },
  { id: "in_progress", name: "In Progress", accent: "bg-blue-500", taskOnly: false },
  { id: "submitted_for_review", name: "In Review", accent: "bg-amber-500", taskOnly: true },
  { id: "needs_rework", name: "Needs Rework", accent: "bg-rose-500", taskOnly: true },
  { id: "complete", name: "Done", accent: "bg-emerald-500", taskOnly: false },
] as const

const BOARD_FILTER_OPTIONS: Array<{ id: BoardFilter; label: string }> = [
  { id: "all", label: "All work" },
  { id: "projects", label: "Projects" },
  { id: "direct", label: "Direct tasks" },
  { id: "overdue", label: "Overdue" },
]

function isTaskOverdue(task: any) {
  return Boolean(task.due_date) && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date)) && task.status !== "complete"
}

function isProjectDeadlineOverdue(project: any) {
  return Boolean(project.deadline) && isPast(new Date(project.deadline)) && !isToday(new Date(project.deadline)) && project.status !== "complete"
}

function includesTerm(values: Array<string | null | undefined>, term: string) {
  return values.some((value) => value?.toLowerCase().includes(term))
}

function countCompletedTasks(items: any[]) {
  return items.filter((item) => item.status === "complete").length
}

function summarizeClient(client: any) {
  const tasks = [...client.tasks, ...client.projects.flatMap((project: any) => project.tasks)]
  const completedTasks = countCompletedTasks(tasks)

  return {
    workItems: client.projects.length + client.tasks.length,
    totalTasks: tasks.length,
    openTasks: tasks.length - completedTasks,
    overdueTasks: tasks.filter(isTaskOverdue).length,
    progress: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
  }
}

function firstLetter(name?: string | null) {
  return name?.trim().charAt(0).toUpperCase() || "C"
}

function findTask(clients: any[], taskId: string) {
  for (const client of clients) {
    const directTask = client.tasks.find((task: any) => task.id === taskId)
    if (directTask) return directTask

    for (const project of client.projects) {
      const projectTask = project.tasks.find((task: any) => task.id === taskId)
      if (projectTask) return projectTask
    }
  }

  return null
}

function reconcileProjectStatus(project: any) {
  if (!project) return project

  if (project.tasks.length === 0) {
    return project.status === "complete" ? { ...project, status: "incomplete" } : project
  }

  if (project.tasks.every((task: any) => task.status === "complete")) {
    return project.status === "complete" ? project : { ...project, status: "complete" }
  }

  if (project.status === "complete") {
    return { ...project, status: "in_progress" }
  }

  return project
}

function reconcileClientsData(clients: any[]) {
  return clients.map((client) => ({
    ...client,
    projects: client.projects.map(reconcileProjectStatus),
  }))
}

export default function ClientsOverviewClient({ initialClients }: { initialClients: any[] }) {
  const searchParams = useSearchParams()
  const [clients, setClients] = useState(() => reconcileClientsData(initialClients))
  const [clientScope, setClientScope] = useState<ClientScope>("active")
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    initialClients.find((client) => !client.archived)?.id || null
  )
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [clientSearch, setClientSearch] = useState("")
  const [boardSearch, setBoardSearch] = useState("")
  const [boardFilter, setBoardFilter] = useState<BoardFilter>("all")
  const [isClientModalOpen, setIsClientModalOpen] = useState(false)
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<EditableClient | null>(null)
  const [deletingClient, setDeletingClient] = useState<any | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<any | null>(null)
  const [projectClientId, setProjectClientId] = useState<string | null>(null)
  const [addingStatus, setAddingStatus] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [actionError, setActionError] = useState("")
  const [actionNotice, setActionNotice] = useState("")
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null)
  const [archivingClientId, setArchivingClientId] = useState<string | null>(null)
  const [convertingTaskId, setConvertingTaskId] = useState<string | null>(null)
  const [isDeliveryDetailsOpen, setIsDeliveryDetailsOpen] = useState(false)
  const [areBoardToolsOpen, setAreBoardToolsOpen] = useState(false)
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false)
  const [clientMembersMap, setClientMembersMap] = useState<Record<string, ClientMember[]>>({})

  const activeClientCount = useMemo(() => clients.filter((client) => !client.archived).length, [clients])
  const archivedClientCount = useMemo(() => clients.filter((client) => client.archived).length, [clients])

  const visibleClientList = useMemo(() => {
    const term = clientSearch.trim().toLowerCase()
    return clients.filter((client) => {
      const matchesScope = clientScope === "archived" ? Boolean(client.archived) : !client.archived
      if (!matchesScope) return false
      if (!term) return true

      return includesTerm([client.name, client.email, client.notes], term)
    })
  }, [clientSearch, clientScope, clients])

  const activeClient = useMemo(() => {
    if (!selectedClientId) return visibleClientList[0] || clients.find((client) => !client.archived) || null
    return clients.find((client) => client.id === selectedClientId) || null
  }, [clients, selectedClientId, visibleClientList])

  const projectClientOptions = useMemo(() => clients.filter((client) => !client.archived), [clients])

  useEffect(() => {
    const taskId = searchParams?.get("taskId")
    if (!taskId || selectedTask) return

    const taskFromQuery = findTask(clients, taskId)
    if (taskFromQuery) {
      const timeoutId = window.setTimeout(() => setSelectedTask(taskFromQuery), 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [clients, searchParams, selectedTask])

  const activeClientSummary = useMemo(() => (activeClient ? summarizeClient(activeClient) : null), [activeClient])

  const visibleProjects = useMemo(() => {
    if (!activeClient) return []
    const term = boardSearch.trim().toLowerCase()

    return activeClient.projects.filter((project: any) => {
      const queryMatches =
        !term ||
        includesTerm([project.name, project.description], term) ||
        project.tasks.some((task: any) => includesTerm([task.title, task.description_rich_text, task.assignee?.full_name], term))

      if (!queryMatches) return false
      if (boardFilter === "direct") return false
      if (boardFilter === "overdue") return project.tasks.some(isTaskOverdue) || isProjectDeadlineOverdue(project)
      return true
    })
  }, [activeClient, boardFilter, boardSearch])

  const visibleDirectTasks = useMemo(() => {
    if (!activeClient) return []
    const term = boardSearch.trim().toLowerCase()

    return activeClient.tasks.filter((task: any) => {
      if (boardFilter === "projects") return false

      const queryMatches = !term || includesTerm([task.title, task.description_rich_text, task.assignee?.full_name], term)
      if (!queryMatches) return false
      if (boardFilter === "overdue") return isTaskOverdue(task)
      return true
    })
  }, [activeClient, boardFilter, boardSearch])

  const boardColumns = useMemo(
    () =>
      STATUS_COLUMNS.map((column) => ({
        ...column,
        projects: column.taskOnly ? [] : visibleProjects.filter((project: any) => project.status === column.id),
        tasks: visibleDirectTasks.filter((task: any) => task.status === column.id),
      })),
    [visibleDirectTasks, visibleProjects]
  )

  const applyTaskUpdate = (updatedTask: any) => {
    setClients((previous) =>
      reconcileClientsData(
        previous.map((client) => ({
          ...client,
          tasks: client.tasks.map((task: any) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task)),
          projects: client.projects.map((project: any) => ({
            ...project,
            tasks: project.tasks.map((task: any) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task)),
          })),
        }))
      )
    )
    if (selectedTask?.id === updatedTask.id) setSelectedTask((prev: any) => ({ ...prev, ...updatedTask }))
  }

  const handleClientSaved = (savedClient: EditableClient) => {
    setClients((previous) => {
      const exists = previous.some((c) => c.id === savedClient.id)
      const updated = exists
        ? previous.map((c) => (c.id === savedClient.id ? { ...c, ...savedClient } : c))
        : [{ ...savedClient, projects: [], tasks: [] }, ...previous]
      return reconcileClientsData(updated)
    })
    setClientScope(savedClient.archived ? "archived" : "active")
    setSelectedClientId(savedClient.id)
    setIsClientModalOpen(false)
    setEditingClient(null)
  }

  const handleProjectCreated = (project: any) => {
    setClients((previous) =>
      reconcileClientsData(
        previous.map((client) =>
          client.id === project.client_id
            ? { ...client, projects: [{ ...project, tasks: [], sections: project.sections || [] }, ...client.projects] }
            : client
        )
      )
    )
    setIsProjectModalOpen(false)
  }

  const handleProjectUpdated = (projectUpdate: any) => {
    setClients((previous) =>
      reconcileClientsData(
        previous.map((client) => ({
          ...client,
          projects: client.projects.map((project: any) => (project.id === projectUpdate.id ? { ...project, ...projectUpdate } : project)),
        }))
      )
    )
  }

  const handleCreateDirectTask = async (status: string) => {
    if (!activeClient) return
    const title = newTaskTitle.trim()
    if (!title) {
      setAddingStatus(null)
      return
    }
    const created = await createTask({ title, client_id: activeClient.id })
    if (created.success && created.task) {
      let finalTask = created.task
      if (status !== "incomplete") {
        const updated = await updateTask(created.task.id, { status: status as any })
        if (updated.success && updated.task) {
          finalTask = updated.task
        }
      }
      setClients((previous) =>
        reconcileClientsData(
          previous.map((client) => (client.id === activeClient.id ? { ...client, tasks: [finalTask, ...client.tasks] } : client))
        )
      )
    }
    setAddingStatus(null)
    setNewTaskTitle("")
  }

  const handleConvertTask = async (task: any) => {
    setConvertingTaskId(task.id)
    const result = await convertDirectTaskToProject(task.id)
    setConvertingTaskId(null)
    if (result.success && result.project && result.task) {
      setClients((previous) =>
        reconcileClientsData(
          previous.map((client) =>
            client.id === task.client_id
              ? {
                  ...client,
                  tasks: client.tasks.filter((t: any) => t.id !== task.id),
                  projects: [{ ...result.project, tasks: [result.task] }, ...client.projects],
                }
              : client
          )
        )
      )
    }
  }

  const handleDeleteClient = async () => {
    if (!deletingClient) return
    setDeletingClientId(deletingClient.id)
    await deleteClient(deletingClient.id)
    setClients((previous) => previous.filter((c) => c.id !== deletingClient.id))
    setDeletingClientId(null)
    setDeletingClient(null)
  }

  const handleArchiveChange = async () => {
    if (!archiveTarget) return
    const shouldArchive = !archiveTarget.archived
    setArchivingClientId(archiveTarget.id)
    const result = await setClientArchived(archiveTarget.id, shouldArchive)
    setArchivingClientId(null)
    if (result.success) {
      setClients((previous) => reconcileClientsData(previous.map((c) => (c.id === archiveTarget.id ? { ...c, archived: shouldArchive } : c))))
    }
    setArchiveTarget(null)
  }

  const handleBoardDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination || !activeClient || (destination.droppableId === source.droppableId && destination.index === source.index)) return
    const [type, id] = draggableId.split(":")
    if (type === "project") {
      setClients((prev) =>
        reconcileClientsData(
          prev.map((c) => ({ ...c, projects: c.projects.map((p: any) => (p.id === id ? { ...p, status: destination.droppableId } : p)) }))
        )
      )
      await updateProject(id, { status: destination.droppableId as any })
    } else {
      const task = activeClient.tasks.find((t: any) => t.id === id) || activeClient.projects.flatMap((p: any) => p.tasks).find((t: any) => t.id === id)
      if (task) {
        applyTaskUpdate({ ...task, status: destination.droppableId })
        await updateTask(id, { status: destination.droppableId as any })
      }
    }
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#18181b]">
        <div className="shrink-0 border-b border-[#3f3f46] bg-[#202023] px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div className="flex items-center rounded-lg border border-[#3f3f46] bg-[#18181b] p-1">
                <button
                  onClick={() => { setClientScope("active"); setSelectedClientId(null) }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md ${clientScope === "active" ? "bg-[#27272a] text-[#f4f4f5]" : "text-[#a1a1aa]"}`}
                >
                  Active ({activeClientCount})
                </button>
                <button
                  onClick={() => { setClientScope("archived"); setSelectedClientId(null) }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md ${clientScope === "archived" ? "bg-amber-500/20 text-amber-300" : "text-[#a1a1aa]"}`}
                >
                  Archived ({archivedClientCount})
                </button>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar max-w-[500px]">
                {visibleClientList.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClientId(client.id)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${client.id === activeClient?.id ? "border-[#0075de]/60 bg-[#0075de]/20 text-white" : "border-[#3f3f46] bg-[#18181b] text-[#a1a1aa]"}`}
                  >
                    {firstLetter(client.name)} {client.name}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setIsClientModalOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#0075de] px-3.5 text-xs font-semibold text-white">
              <Plus className="h-3.5 w-3.5" /> New client
            </button>
          </div>
        </div>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {!activeClient ? (
            <div className="flex h-full items-center justify-center text-center">
              <div className="max-w-sm">
                <h2 className="text-lg font-semibold text-[#f4f4f5]">Build your client workspace</h2>
                <button onClick={() => setIsClientModalOpen(true)} className="mt-5 rounded-full bg-[#0075de] px-4 py-2 text-xs font-semibold text-white">Add first client</button>
              </div>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-[#3f3f46] bg-[#202023] px-6 py-4 flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-[#f4f4f5]">{activeClient.name}</h1>
                  <p className="text-xs text-[#a1a1aa]">{activeClientSummary?.progress || 0}% complete</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsMemberModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#3f3f46] bg-[#18181b] px-3 py-1.5 text-xs font-semibold text-[#f4f4f5] transition-colors hover:bg-[#27272a]"
                  >
                    <UserPlus className="h-3.5 w-3.5 text-[#0075de]" /> Add people
                  </button>
                  <button onClick={() => setEditingClient(activeClient)} className="rounded-md border border-[#3f3f46] px-3 py-1.5 text-xs text-[#f4f4f5]">Edit</button>
                  <button onClick={() => { setProjectClientId(activeClient.id); setIsProjectModalOpen(true); }} className="rounded-full bg-[#0075de] px-3 py-1.5 text-xs text-white">New project</button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-[#18181b] p-6 space-y-6 custom-scrollbar">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[#a1a1aa]">
                      Projects ({activeClient.projects.length})
                    </h2>
                    <button
                      onClick={() => { setProjectClientId(activeClient.id); setIsProjectModalOpen(true); }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#0075de] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#005bab]"
                    >
                      <Plus className="h-3.5 w-3.5" /> New project
                    </button>
                  </div>

                  {activeClient.projects.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#3f3f46] p-8 text-center text-xs text-[#a1a1aa]">
                      No projects created for {activeClient.name} yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {activeClient.projects.map((project: any) => (
                        <ProjectCard key={project.id} project={project} isDragging={false} />
                      ))}
                    </div>
                  )}
                </div>

                {activeClient.tasks.length > 0 ? (
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[#a1a1aa] mb-3">
                      Direct Client Tasks ({activeClient.tasks.length})
                    </h2>
                    <div className="space-y-2">
                      {activeClient.tasks.map((task: any) => (
                        <DirectTaskCard
                          key={task.id}
                          task={task}
                          isDragging={false}
                          isConverting={convertingTaskId === task.id}
                          onOpen={() => setSelectedTask(task)}
                          onConvert={() => void handleConvertTask(task)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      <CreateClientModal isOpen={isClientModalOpen} onClose={() => setIsClientModalOpen(false)} onSuccess={handleClientSaved} />
      <CreateClientModal isOpen={!!editingClient} onClose={() => setEditingClient(null)} client={editingClient} onSuccess={handleClientSaved} />
      <CreateProjectModal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} clients={projectClientOptions} initialClientId={projectClientId || activeClient?.id} onSuccess={handleProjectCreated} />
      <TaskDrawer task={selectedTask} isOpen={!!selectedTask} onClose={() => setSelectedTask(null)} onTaskUpdated={applyTaskUpdate} />
      <ArchiveClientModal client={archiveTarget} isSaving={!!archivingClientId} onCancel={() => setArchiveTarget(null)} onConfirm={handleArchiveChange} />
      <DeleteClientModal client={deletingClient} isDeleting={!!deletingClientId} onCancel={() => setDeletingClient(null)} onConfirm={handleDeleteClient} />
      {activeClient ? (
        <AddClientMemberModal
          isOpen={isMemberModalOpen}
          onClose={() => setIsMemberModalOpen(false)}
          clientName={activeClient.name}
          clientId={activeClient.id}
          currentMembers={clientMembersMap[activeClient.id] || []}
          onMembersUpdated={(updated) => setClientMembersMap((prev) => ({ ...prev, [activeClient.id]: updated }))}
        />
      ) : null}
    </>
  )
}

function CompactMetric({ label, value, detail, danger }: { label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <div className="p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#71717a]">{label}</div>
      <div className="flex items-baseline gap-2 sm:mt-1">
        <span className={`text-lg font-bold ${danger ? "text-rose-400" : "text-[#f4f4f5]"}`}>{value}</span>
        <span className="text-[11px] text-[#a1a1aa] font-medium">{detail}</span>
      </div>
    </div>
  )
}

function StatusBoardColumn({
  column,
  addingStatus,
  newTaskTitle,
  convertingTaskId,
  onTaskTitleChange,
  onStartAdding,
  onCancelAdding,
  onCreateTask,
  onOpenTask,
  onConvertTask,
}: {
  column: { id: string; name: string; accent: string; taskOnly: boolean; projects: any[]; tasks: any[] }
  addingStatus: string | null
  newTaskTitle: string
  convertingTaskId: string | null
  onTaskTitleChange: (value: string) => void
  onStartAdding: () => void
  onCancelAdding: () => void
  onCreateTask: () => void
  onOpenTask: (task: any) => void
  onConvertTask: (task: any) => void
}) {
  return (
    <div className="flex min-h-[360px] w-[calc(100vw-2rem)] shrink-0 flex-col rounded-xl border border-[#3f3f46] bg-[#202023] sm:w-[300px]">
      <div className="border-b border-[#3f3f46] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${column.accent}`} />
            <div className="truncate text-xs font-bold uppercase tracking-wider text-[#f4f4f5]">{column.name}</div>
          </div>
          <span className="rounded-full bg-[#18181b] px-2 py-0.5 text-[10px] font-bold text-[#a1a1aa]">{column.projects.length + column.tasks.length}</span>
        </div>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className={`flex-1 p-3 space-y-2.5 transition-colors ${snapshot.isDraggingOver ? "bg-[#18181b]/60" : ""}`}>
            <div className="space-y-2.5">
              {column.projects.map((project, index) => (
                <Draggable key={`project:${project.id}`} draggableId={`project:${project.id}`} index={index} disableInteractiveElementBlocking>
                  {(draggableProvided, draggableSnapshot) => (
                    <div ref={draggableProvided.innerRef} {...draggableProvided.draggableProps} {...draggableProvided.dragHandleProps} style={draggableProvided.draggableProps.style}>
                      <ProjectCard project={project} isDragging={draggableSnapshot.isDragging} />
                    </div>
                  )}
                </Draggable>
              ))}

              {column.tasks.map((task, index) => (
                <Draggable key={`task:${task.id}`} draggableId={`task:${task.id}`} index={column.projects.length + index} disableInteractiveElementBlocking>
                  {(draggableProvided, draggableSnapshot) => (
                    <div ref={draggableProvided.innerRef} {...draggableProvided.draggableProps} {...draggableProvided.dragHandleProps} style={draggableProvided.draggableProps.style}>
                      <DirectTaskCard
                        task={task}
                        isDragging={draggableSnapshot.isDragging}
                        isConverting={convertingTaskId === task.id}
                        onOpen={() => onOpenTask(task)}
                        onConvert={() => onConvertTask(task)}
                      />
                    </div>
                  )}
                </Draggable>
              ))}

              {provided.placeholder}

              {addingStatus === column.id ? (
                <div className="rounded-lg border border-[#3f3f46] bg-[#18181b] p-3 shadow-md">
                  <input
                    value={newTaskTitle}
                    onChange={(event) => onTaskTitleChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onCreateTask()
                      if (event.key === "Escape") onCancelAdding()
                    }}
                    placeholder={`Add a ${column.name.toLowerCase()} direct task`}
                    className="w-full bg-transparent text-xs text-[#f4f4f5] outline-none placeholder:text-[#a1a1aa]"
                    autoFocus
                  />
                  <div className="mt-2.5 flex items-center gap-2">
                    <button onClick={onCreateTask} className="rounded-full bg-[#0075de] px-3 py-1 text-xs font-semibold text-white hover:bg-[#005bab]">
                      Add task
                    </button>
                    <button onClick={onCancelAdding} className="rounded-md px-3 py-1 text-xs font-medium text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#f4f4f5]">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={onStartAdding} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#3f3f46] text-xs font-semibold text-[#a1a1aa] transition-colors hover:border-[#0075de]/50 hover:text-[#f4f4f5]">
                  <Plus className="h-3.5 w-3.5 text-[#0075de]" />
                  Add direct task
                </button>
              )}

              {column.projects.length === 0 && column.tasks.length === 0 && addingStatus !== column.id ? (
                <div className="rounded-lg border border-dashed border-[#3f3f46] px-4 py-6 text-center text-xs text-[#71717a]">Nothing here yet.</div>
              ) : null}
            </div>
          </div>
        )}
      </Droppable>
    </div>
  )
}

function ProjectCard({ project, isDragging }: { project: any; isDragging: boolean }) {
  const completedTasks = countCompletedTasks(project.tasks)
  const progress = project.tasks.length > 0 ? Math.round((completedTasks / project.tasks.length) * 100) : 0
  const overdueCount = project.tasks.filter(isTaskOverdue).length

  return (
    <Link href={`/projects/${project.id}/${project.default_view || "board"}`} className={`block w-full rounded-lg border border-[#3f3f46] bg-[#202023] p-3 text-left transition-all ${isDragging ? "rotate-1 border-[#0075de]/50 shadow-xl bg-[#27272a]" : "hover:border-[#0075de]/50 hover:shadow-md"}`}>
      <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#60a5fa]">
        <FolderKanban className="h-3 w-3" />
        Project
      </div>
      <div dir="auto" className="text-xs font-semibold leading-5 text-[#f4f4f5]">{project.name}</div>
      <div className="mt-2.5 flex flex-wrap gap-2 text-[10px] text-[#a1a1aa] font-medium">
        <span>{project.tasks.length} tasks</span>
        <span>•</span>
        <span>{progress}% complete</span>
        {project.deadline ? (
          <span className={`inline-flex items-center gap-1 ${isProjectDeadlineOverdue(project) ? "text-rose-400 font-semibold" : ""}`}>
            <Calendar className="h-3 w-3" />
            {format(new Date(project.deadline), "MMM d")}
          </span>
        ) : null}
        {overdueCount > 0 ? <span className="text-rose-400 font-semibold">{overdueCount} overdue</span> : null}
      </div>
    </Link>
  )
}

function DirectTaskCard({
  task,
  isDragging,
  isConverting,
  onOpen,
  onConvert,
}: {
  task: any
  isDragging: boolean
  isConverting: boolean
  onOpen: () => void
  onConvert: () => void
}) {
  return (
    <div className={`group rounded-lg border border-[#3f3f46] bg-[#202023] p-3 transition-all ${isDragging ? "rotate-1 border-[#0075de]/50 shadow-xl bg-[#27272a]" : "hover:border-[#0075de]/50 hover:shadow-md"}`}>
      <button onClick={onOpen} className="w-full text-left">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div dir="auto" className={`w-full text-xs font-semibold leading-5 ${task.status === "complete" ? "text-[#71717a] line-through" : "text-[#f4f4f5]"}`}>{task.title}</div>
          <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${task.status === "complete" ? "text-emerald-400" : "text-[#71717a]"}`} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#a1a1aa] font-medium">
          <span className="inline-flex items-center gap-1 text-[#60a5fa] font-semibold">
            <Briefcase className="h-3 w-3" />
            Direct task
          </span>
          {task.assignee?.full_name ? <span>{task.assignee.full_name}</span> : null}
          {task.due_date ? (
            <span className={`inline-flex items-center gap-1 ${isTaskOverdue(task) ? "text-rose-400 font-semibold" : ""}`}>
              <Calendar className="h-3 w-3" />
              {format(new Date(task.due_date), "MMM d")}
            </span>
          ) : null}
        </div>
      </button>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#27272a] pt-2">
        {task.priority ? <span className="text-[9px] font-bold uppercase tracking-wider text-[#a1a1aa]">{task.priority}</span> : <span />}
        <button
          onClick={(event) => {
            event.stopPropagation()
            onConvert()
          }}
          disabled={isConverting}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold text-[#60a5fa] hover:bg-[#0075de]/10 disabled:opacity-50"
        >
          <ArrowUpCircle className="h-3 w-3" />
          {isConverting ? "Converting..." : "To Project"}
        </button>
      </div>
    </div>
  )
}

function ArchiveClientModal({
  client,
  isSaving,
  onCancel,
  onConfirm,
}: {
  client: any | null
  isSaving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!client) return null

  const isRestoring = Boolean(client.archived)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="max-h-dvh w-full overflow-y-auto overscroll-contain rounded-t-xl border border-[#3f3f46] bg-[#202023] p-4 shadow-2xl custom-scrollbar sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:rounded-xl sm:p-6">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isRestoring ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
          {isRestoring ? <RotateCcw className="h-5 w-5" /> : <Archive className="h-5 w-5" />}
        </div>
        <h3 className="mt-3 break-words text-lg font-semibold text-[#f4f4f5]">
          {isRestoring ? `Restore ${client.name}?` : `Archive ${client.name}?`}
        </h3>
        <p className="mt-2 text-xs leading-5 text-[#a1a1aa]">
          {isRestoring
            ? "The client will return to your active client list."
            : "The client will disappear from active lists. Its projects, tasks, and history will stay intact and can be restored at any time."}
        </p>
        <div className="mt-4 rounded-lg border border-[#3f3f46] bg-[#18181b] p-3 text-xs text-[#a1a1aa]">
          {client.projects.length} projects and {client.tasks.length} direct tasks will remain saved.
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button onClick={onCancel} disabled={isSaving} className="w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-4 py-1.5 text-xs font-semibold text-[#f4f4f5] transition-colors hover:bg-[#27272a] disabled:opacity-50 sm:w-auto">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isSaving}
            className={`w-full rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 sm:w-auto ${isRestoring ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-600 hover:bg-amber-500"}`}
          >
            {isSaving ? "Saving..." : isRestoring ? "Restore client" : "Archive client"}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteClientModal({
  client,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  client: any | null
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [confirmationName, setConfirmationName] = useState("")

  useEffect(() => {
    setConfirmationName("")
  }, [client?.id])

  if (!client) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="max-h-dvh w-full overflow-y-auto overscroll-contain rounded-t-xl border border-[#3f3f46] bg-[#202023] p-4 shadow-2xl custom-scrollbar sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:rounded-xl sm:p-6">
        <h3 className="break-words text-lg font-semibold text-[#f4f4f5]">Delete {client.name}?</h3>
        <p className="mt-2 text-xs leading-5 text-[#a1a1aa]">This permanently removes the client together with its nested projects and direct tasks.</p>
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <div>{client.projects.length} projects will be deleted.</div>
          <div>{client.tasks.length} direct tasks will be deleted.</div>
        </div>
        <div className="mt-4 space-y-1.5">
          <label htmlFor="delete-client-confirmation" className="block break-words text-[10px] font-bold uppercase tracking-wider text-[#a1a1aa]">
            Type {client.name} to confirm
          </label>
          <input
            id="delete-client-confirmation"
            value={confirmationName}
            onChange={(event) => setConfirmationName(event.target.value)}
            placeholder={client.name}
            className="h-9 w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-3 text-xs text-[#f4f4f5] outline-none placeholder:text-[#71717a] focus:border-rose-500"
          />
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button onClick={onCancel} disabled={isDeleting} className="w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-4 py-1.5 text-xs font-semibold text-[#f4f4f5] transition-colors hover:bg-[#27272a] disabled:opacity-50 sm:w-auto">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isDeleting || confirmationName !== client.name} className="w-full rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50 sm:w-auto">
            {isDeleting ? "Deleting..." : "Delete Client"}
          </button>
        </div>
      </div>
    </div>
  )
}
