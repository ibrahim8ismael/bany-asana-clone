"use client"

import dynamic from "next/dynamic"
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
  ChevronsLeft,
  ChevronsRight,
  CheckCircle2,
  FolderKanban,
  Mail,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { convertDirectTaskToProject, createTask, deleteClient, setClientArchived, updateProject, updateTask } from "@/actions/server-actions"
import type { EditableClient } from "@/components/create-client-modal"

const CreateClientModal = dynamic(() => import("@/components/create-client-modal"), { ssr: false })
const CreateProjectModal = dynamic(() => import("@/components/create-project-modal"), { ssr: false })
const ProjectBoardModal = dynamic(() => import("@/components/project-board-modal"), { ssr: false })
const TaskDrawer = dynamic(() => import("@/components/task-drawer"), { ssr: false })

type BoardFilter = "all" | "projects" | "direct" | "overdue"
type ClientScope = "active" | "archived"

const CLIENT_LIST_COLLAPSED_STORAGE_KEY = "clients-board-list-collapsed-v1"

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
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
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
  const [isClientListCollapsed, setIsClientListCollapsed] = useState(false)
  const [hasLoadedClientListState, setHasLoadedClientListState] = useState(false)
  const [isDeliveryDetailsOpen, setIsDeliveryDetailsOpen] = useState(false)
  const [areBoardToolsOpen, setAreBoardToolsOpen] = useState(false)

  const projectClientOptions = useMemo(
    () => clients.filter((client) => !client.archived).map((client) => ({ id: client.id, name: client.name, color: client.color })),
    [clients]
  )

  const activeClientCount = useMemo(() => clients.filter((client) => !client.archived).length, [clients])
  const archivedClientCount = clients.length - activeClientCount
  const clientsInScope = useMemo(
    () => clients.filter((client) => Boolean(client.archived) === (clientScope === "archived")),
    [clientScope, clients]
  )

  const visibleClientList = useMemo(() => {
    const term = clientSearch.trim().toLowerCase()
    if (!term) return clientsInScope

    return clientsInScope.filter((client) => includesTerm([client.name, client.email, client.notes], term))
  }, [clientSearch, clientsInScope])

  const selectedClient = useMemo(
    () => clientsInScope.find((client) => client.id === selectedClientId) || null,
    [clientsInScope, selectedClientId]
  )

  const activeClient = useMemo(
    () => selectedClient || visibleClientList[0] || clientsInScope[0] || null,
    [clientsInScope, selectedClient, visibleClientList]
  )

  const selectedProject = useMemo(
    () => activeClient?.projects.find((project: any) => project.id === selectedProjectId) || null,
    [activeClient, selectedProjectId]
  )

  const activeClientSummary = useMemo(
    () => (activeClient ? summarizeClient(activeClient) : null),
    [activeClient]
  )

  const visibleProjects = useMemo(() => {
    if (!activeClient) return []
    const term = boardSearch.trim().toLowerCase()

    return activeClient.projects.filter((project: any) => {
      if (boardFilter === "direct") return false

      const queryMatches =
        !term ||
        includesTerm([project.name, project.description], term) ||
        project.tasks.some((task: any) => includesTerm([task.title, task.description_rich_text, task.assignee?.full_name], term))

      if (!queryMatches) return false
      if (boardFilter === "overdue") return project.tasks.some(isTaskOverdue)
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

  useEffect(() => {
    if (!clientsInScope.length) {
      setSelectedClientId(null)
      return
    }

    if (selectedClientId && clientsInScope.some((client) => client.id === selectedClientId)) return
    setSelectedClientId(clientsInScope[0].id)
  }, [clientsInScope, selectedClientId])

  useEffect(() => {
    if (!selectedProjectId || !activeClient) return
    if (activeClient.projects.some((project: any) => project.id === selectedProjectId)) return
    setSelectedProjectId(null)
  }, [activeClient, selectedProjectId])

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(CLIENT_LIST_COLLAPSED_STORAGE_KEY)
      if (rawValue !== null) {
        setIsClientListCollapsed(rawValue === "true")
      }
    } catch {
      setIsClientListCollapsed(false)
    } finally {
      setHasLoadedClientListState(true)
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedClientListState) return

    window.localStorage.setItem(CLIENT_LIST_COLLAPSED_STORAGE_KEY, String(isClientListCollapsed))
  }, [hasLoadedClientListState, isClientListCollapsed])

  useEffect(() => {
    if (!actionError) return

    const timeoutId = window.setTimeout(() => setActionError(""), 6000)
    return () => window.clearTimeout(timeoutId)
  }, [actionError])

  useEffect(() => {
    if (!actionNotice) return

    const timeoutId = window.setTimeout(() => setActionNotice(""), 5000)
    return () => window.clearTimeout(timeoutId)
  }, [actionNotice])

  useEffect(() => {
    const clientId = searchParams?.get("clientId")
    const taskId = searchParams?.get("taskId")

    if (clientId) {
      const requestedClient = clients.find((client) => client.id === clientId)
      if (requestedClient) {
        setClientScope(requestedClient.archived ? "archived" : "active")
        setSelectedClientId(clientId)
      }
    }

    if (!taskId || selectedTask) return

    const taskFromQuery = findTask(clients, taskId)
    if (!taskFromQuery) return

    if (taskFromQuery.client_id) {
      const taskClient = clients.find((client) => client.id === taskFromQuery.client_id)
      setClientScope(taskClient?.archived ? "archived" : "active")
      setSelectedClientId(taskFromQuery.client_id)
    }

    if (taskFromQuery.project_id) {
      setSelectedProjectId(taskFromQuery.project_id)
    }

    const timeoutId = window.setTimeout(() => setSelectedTask(taskFromQuery), 0)
    return () => window.clearTimeout(timeoutId)
  }, [clients, searchParams, selectedTask])

  const updateClientsState = (updater: (clients: any[]) => any[]) => {
    setClients((previous) => reconcileClientsData(updater(previous)))
  }

  const applyTaskUpdate = (updatedTask: any) => {
    updateClientsState((previous) => {
      const withoutTask = previous.map((client) => ({
        ...client,
        tasks: client.tasks.filter((task: any) => task.id !== updatedTask.id),
        projects: client.projects.map((project: any) => ({
          ...project,
          tasks: project.tasks.filter((task: any) => task.id !== updatedTask.id),
        })),
      }))

      if (!updatedTask.client_id) return withoutTask

      return withoutTask.map((client) => {
        if (client.id !== updatedTask.client_id) return client

        if (updatedTask.project_id) {
          return {
            ...client,
            projects: client.projects.map((project: any) =>
              project.id === updatedTask.project_id
                ? { ...project, tasks: [updatedTask, ...project.tasks] }
                : project
            ),
          }
        }

        return {
          ...client,
          tasks: [updatedTask, ...client.tasks],
        }
      })
    })
  }

  const handleClientSaved = (savedClient: EditableClient) => {
    setActionError("")
    setActionNotice("")

    updateClientsState((previous) => {
      const existing = previous.find((client) => client.id === savedClient.id)
      if (!existing) {
        return [{ ...savedClient, projects: [], tasks: [] }, ...previous]
      }

      return previous.map((client) => (client.id === savedClient.id ? { ...client, ...savedClient } : client))
    })

    setClientScope(savedClient.archived ? "archived" : "active")
    setSelectedClientId(savedClient.id)
    setEditingClient(null)
  }

  const handleProjectCreated = (project: any) => {
    if (!project.client_id) return

    setActionError("")
    updateClientsState((previous) =>
      previous.map((client) =>
        client.id === project.client_id
          ? { ...client, projects: [{ ...project, tasks: [], sections: project.sections || [] }, ...client.projects] }
          : client
      )
    )
    setSelectedClientId(project.client_id)
    setSelectedProjectId(project.id)
  }

  const handleProjectUpdated = (projectUpdate: any) => {
    setActionError("")
    updateClientsState((previous) =>
      previous.map((client) => ({
        ...client,
        projects: client.projects.map((project: any) =>
          project.id === projectUpdate.id
            ? {
                ...project,
                ...projectUpdate,
                tasks: project.tasks,
                sections: projectUpdate.sections || project.sections,
              }
            : project
        ),
      }))
    )
  }

  const handleCreateDirectTask = async (status: string) => {
    if (!activeClient) return

    const title = newTaskTitle.trim()
    if (!title) {
      setAddingStatus(null)
      setNewTaskTitle("")
      return
    }

    setActionError("")

    const created = await createTask({ title, client_id: activeClient.id })
    if (!created.success || !created.task) {
      setActionError(created.error || "Failed to create direct task")
      return
    }

    let nextTask = created.task
    if (status !== "incomplete") {
      const updated = await updateTask(created.task.id, { status: status as any })
      if (updated.success && updated.task) {
        nextTask = updated.task
      }
    }

    applyTaskUpdate(nextTask)
    setSelectedTask(nextTask)
    setAddingStatus(null)
    setNewTaskTitle("")
  }

  const handleConvertTask = async (task: any) => {
    setConvertingTaskId(task.id)
    setActionError("")

    const result = await convertDirectTaskToProject(task.id)

    setConvertingTaskId(null)

    if (!result.success || !result.project || !result.task) {
      setActionError(result.error || "Failed to convert task into project")
      return
    }

    updateClientsState((previous) =>
      previous.map((client) => {
        if (client.id !== task.client_id) return client

        return {
          ...client,
          tasks: client.tasks.filter((entry: any) => entry.id !== task.id),
          projects: [{ ...result.project, tasks: [result.task], sections: result.project.sections || [] }, ...client.projects],
        }
      })
    )

    setSelectedClientId(task.client_id)
    setSelectedProjectId(result.project.id)
  }

  const handleDeleteClient = async () => {
    if (!deletingClient) return

    setDeletingClientId(deletingClient.id)
    setActionError("")

    const result = await deleteClient(deletingClient.id)

    setDeletingClientId(null)

    if (!result.success) {
      setActionError(result.error || "Failed to delete client")
      return
    }

    updateClientsState((previous) => previous.filter((client) => client.id !== deletingClient.id))
    if (selectedTask?.client_id === deletingClient.id) setSelectedTask(null)
    if (selectedClientId === deletingClient.id) setSelectedClientId(null)
    if (selectedProjectId && deletingClient.projects.some((project: any) => project.id === selectedProjectId)) setSelectedProjectId(null)
    setDeletingClient(null)
  }

  const handleArchiveChange = async () => {
    if (!archiveTarget) return

    const shouldArchive = !archiveTarget.archived
    setArchivingClientId(archiveTarget.id)
    setActionError("")
    setActionNotice("")

    const result = await setClientArchived(archiveTarget.id, shouldArchive)

    setArchivingClientId(null)

    if (!result.success || !result.client) {
      setActionError(result.error || "Failed to update client archive state")
      return
    }

    updateClientsState((previous) =>
      previous.map((client) =>
        client.id === archiveTarget.id ? { ...client, ...result.client } : client
      )
    )

    if (shouldArchive) {
      setSelectedClientId(null)
      setActionNotice(`${archiveTarget.name} was archived. Its work and history are still saved.`)
    } else {
      setClientScope("active")
      setSelectedClientId(archiveTarget.id)
      setActionNotice(`${archiveTarget.name} was restored to active clients.`)
    }

    setArchiveTarget(null)
  }

  const handleBoardDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination || !activeClient) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const [type, id] = draggableId.split(":")

    if (type === "project") {
      if (["submitted_for_review", "needs_rework"].includes(destination.droppableId)) {
        setActionError("Projects cannot move into task review states")
        return
      }
      const project = activeClient.projects.find((entry: any) => entry.id === id)
      if (!project) return

      const previousClients = clients
      updateClientsState((previous) =>
        previous.map((client) => ({
          ...client,
          projects: client.projects.map((entry: any) =>
            entry.id === id ? { ...entry, status: destination.droppableId } : entry
          ),
        }))
      )

      const updated = await updateProject(id, { status: destination.droppableId })
      if (!updated.success || !updated.project) {
        setClients(previousClients)
        setActionError(updated.error || "Failed to move project")
        return
      }

      handleProjectUpdated(updated.project)
      return
    }

    if (type === "task") {
      const task = activeClient.tasks.find((entry: any) => entry.id === id)
      if (!task) return
      if (task.quality_required || ["submitted_for_review", "needs_rework"].includes(destination.droppableId)) {
        setActionError("Use the task quality panel to move reviewed work")
        return
      }

      const previousClients = clients
      applyTaskUpdate({ ...task, status: destination.droppableId })

      const updated = await updateTask(id, { status: destination.droppableId as any })
      if (!updated.success || !updated.task) {
        setClients(previousClients)
        setActionError(updated.error || "Failed to move task")
        return
      }

      applyTaskUpdate(updated.task)
    }
  }

  return (
    <>
      <div className={`grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[#1e1f21] lg:grid-rows-1 ${isClientListCollapsed ? "lg:grid-cols-[68px_minmax(0,1fr)]" : "lg:grid-cols-[260px_minmax(0,1fr)]"}`}>
        <aside className="flex h-[34dvh] min-h-[200px] min-w-0 w-full flex-col border-b border-white/5 bg-[#191a1c] lg:h-auto lg:min-h-0 lg:border-b-0 lg:border-r">
          {isClientListCollapsed ? (
            <>
              <div className="border-b border-white/5 p-2">
                <button
                  onClick={() => setIsClientListCollapsed(false)}
                  className="flex h-9 w-full items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/65 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Open client list"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-2 custom-scrollbar">
                <div className="flex gap-2 lg:block lg:space-y-2">
                  {visibleClientList.map((client) => {
                    const active = client.id === activeClient?.id

                    return (
                      <button
                        key={client.id}
                        onClick={() => {
                          setSelectedClientId(client.id)
                          setSelectedProjectId(null)
                        }}
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md border p-1.5 transition-colors lg:w-full ${active ? "border-[#f06a6a]/45 bg-[#454649]" : "border-[#444548] bg-[#303133] hover:border-[#5c5d61] hover:bg-[#36373a]"}`}
                        title={client.name}
                        aria-label={`Open ${client.name}`}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold text-white" style={{ backgroundColor: client.color || "#f06a6a" }}>
                          {firstLetter(client.name)}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-white/5 p-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsClientModalOpen(true)}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-[#f06a6a] px-3 text-xs font-bold text-white transition-colors hover:bg-[#e45f5f]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New client
                  </button>
                  {clientScope === "active" ? (
                    <button
                      onClick={() => {
                        setProjectClientId(activeClient?.id || projectClientOptions[0]?.id || null)
                        setIsProjectModalOpen(true)
                      }}
                      disabled={projectClientOptions.length === 0}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="New project"
                      title="New project"
                    >
                      <FolderKanban className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    onClick={() => setIsClientListCollapsed(true)}
                    className="ml-auto hidden h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white lg:inline-flex"
                    aria-label="Collapse client list"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 rounded-md border border-white/10 bg-black/10 p-1" role="tablist" aria-label="Client status">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={clientScope === "active"}
                    onClick={() => {
                      setClientScope("active")
                      setSelectedClientId(null)
                      setClientSearch("")
                    }}
                    className={`flex h-8 items-center justify-center gap-1.5 rounded text-xs font-semibold transition-colors ${clientScope === "active" ? "bg-[#454649] text-white/90" : "text-white/40 hover:text-white/70"}`}
                  >
                    Active
                    <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px]">{activeClientCount}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={clientScope === "archived"}
                    onClick={() => {
                      setClientScope("archived")
                      setSelectedClientId(null)
                      setClientSearch("")
                    }}
                    className={`flex h-8 items-center justify-center gap-1.5 rounded text-xs font-semibold transition-colors ${clientScope === "archived" ? "bg-amber-500/15 text-amber-100" : "text-white/40 hover:text-white/70"}`}
                  >
                    <Archive className="h-3 w-3" />
                    Archived
                    <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px]">{archivedClientCount}</span>
                  </button>
                </div>

                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                  <input
                    value={clientSearch}
                    onChange={(event) => setClientSearch(event.target.value)}
                    placeholder="Search clients"
                    className="h-9 w-full rounded-md border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-auto p-2 custom-scrollbar">
                {visibleClientList.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/35">
                    {clientSearch ? "No matching clients." : clientScope === "archived" ? "No archived clients." : "No active clients yet."}
                  </div>
                ) : (
                  <div className="flex gap-2 lg:block lg:space-y-2">
                    {visibleClientList.map((client) => {
                      const active = client.id === activeClient?.id
                      const clientSummary = summarizeClient(client)

                      return (
                        <button
                          key={client.id}
                          onClick={() => {
                            setSelectedClientId(client.id)
                            setSelectedProjectId(null)
                            setBoardSearch("")
                            setBoardFilter("all")
                          }}
                          className={`w-[230px] shrink-0 rounded-md border px-3 py-2.5 text-left transition-colors lg:w-full ${active ? "border-[#f06a6a]/45 bg-[#454649]" : "border-transparent bg-transparent hover:border-[#4b4c4f] hover:bg-[#303133]"}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ backgroundColor: client.color || "#f06a6a" }}>
                              {firstLetter(client.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-white/90">{client.name}</div>
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-white/35">
                                <span>{client.projects.length} projects</span>
                                <span>{client.tasks.length} direct</span>
                                <span>{clientSummary.progress}% done</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {!activeClient ? (
            <div className="flex h-full items-center justify-center px-6 py-12 text-center">
              <div className="max-w-sm">
                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border ${clientScope === "archived" ? "border-amber-400/20 bg-amber-400/10 text-amber-200" : "border-[#f06a6a]/25 bg-[#f06a6a]/10 text-[#ffaaaa]"}`}>
                  {clientScope === "archived" ? <Archive className="h-6 w-6" /> : <Briefcase className="h-6 w-6" />}
                </div>
                <h2 className="mt-5 text-xl font-semibold text-white/90">{clientScope === "archived" ? "No archived clients" : "Build your client workspace"}</h2>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  {clientScope === "archived"
                    ? "Clients you archive will appear here, with all projects, tasks, and history preserved."
                    : "Add a client to organize their projects, direct requests, deadlines, and delivery health in one place."}
                </p>
                {clientScope === "active" ? (
                  <button onClick={() => setIsClientModalOpen(true)} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#f06a6a] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#e45f5f]">
                    <Plus className="h-4 w-4" />
                    Add first client
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-[#414245] bg-[#1e1f21]">
                <div className="flex min-h-[76px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: activeClient.color || "#f06a6a" }}>
                      {firstLetter(activeClient.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <h1 className="truncate text-xl font-semibold tracking-[-0.03em] text-white/95">{activeClient.name}</h1>
                        {activeClient.archived ? (
                          <span className="shrink-0 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">Archived</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-white/40">
                        <span>{activeClientSummary?.progress || 0}% complete</span>
                        <span aria-hidden="true">/</span>
                        <span>{activeClientSummary?.openTasks || 0} open</span>
                        {(activeClientSummary?.overdueTasks || 0) > 0 ? (
                          <><span aria-hidden="true">/</span><span className="text-red-300">{activeClientSummary?.overdueTasks} overdue</span></>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() =>
                        setEditingClient({
                          ...activeClient,
                          projectCount: activeClient.projects.length,
                          directTaskCount: activeClient.tasks.length,
                        })
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#55565a] px-3 text-xs font-semibold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                    {activeClient.archived ? (
                      <button
                        onClick={() => setArchiveTarget(activeClient)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-400/25 bg-amber-400/10 px-3 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-400/15"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Restore</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setArchiveTarget(activeClient)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#55565a] px-3 text-xs font-semibold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Archive</span>
                        </button>
                        <button
                          onClick={() => {
                            setProjectClientId(activeClient.id)
                            setIsProjectModalOpen(true)
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#f06a6a] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#e45f5f]"
                        >
                          <FolderKanban className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">New project</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex h-12 items-center gap-1 border-t border-[#343538] px-3 sm:px-5">
                  <button
                    onClick={() => setIsDeliveryDetailsOpen((current) => !current)}
                    aria-expanded={isDeliveryDetailsOpen}
                    className={`inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-xs font-semibold transition-colors ${isDeliveryDetailsOpen ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/85"}`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Details
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isDeliveryDetailsOpen ? "rotate-180" : ""}`} />
                  </button>
                  <button
                    onClick={() => setAreBoardToolsOpen((current) => !current)}
                    aria-expanded={areBoardToolsOpen}
                    className={`inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-xs font-semibold transition-colors ${areBoardToolsOpen ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/85"}`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Search & filter
                    {boardFilter !== "all" || boardSearch ? <span className="h-1.5 w-1.5 rounded-full bg-[#f06a6a]" /> : null}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${areBoardToolsOpen ? "rotate-180" : ""}`} />
                  </button>
                  <span className="ml-auto text-xs text-white/30">{visibleProjects.length + visibleDirectTasks.length} items</span>
                </div>

                <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isDeliveryDetailsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <div className="border-t border-[#343538] px-4 py-3 sm:px-6">
                      {activeClient.notes || activeClient.email ? (
                        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/45">
                          {activeClient.email ? <a href={`mailto:${activeClient.email}`} className="inline-flex items-center gap-1.5 hover:text-white/75"><Mail className="h-3.5 w-3.5" />{activeClient.email}</a> : null}
                          {activeClient.notes ? <span dir="auto" className="line-clamp-1">{activeClient.notes}</span> : null}
                        </div>
                      ) : null}
                      <div className="grid divide-y divide-[#414245] rounded-md border border-[#414245] bg-[#242527] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                        <CompactMetric label="Progress" value={`${activeClientSummary?.progress || 0}%`} detail={`${activeClientSummary?.totalTasks || 0} tasks`} />
                        <CompactMetric label="Workstreams" value={String(activeClientSummary?.workItems || 0)} detail={`${activeClient.projects.length} projects`} />
                        <CompactMetric label="Open tasks" value={String(activeClientSummary?.openTasks || 0)} detail="In delivery" />
                        <CompactMetric label="Overdue" value={String(activeClientSummary?.overdueTasks || 0)} detail="Need attention" danger={(activeClientSummary?.overdueTasks || 0) > 0} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${areBoardToolsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-2 border-t border-[#343538] px-4 py-3 sm:flex-row sm:items-center sm:px-6">
                      <div className="relative min-w-0 flex-1 sm:max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                        <input
                          value={boardSearch}
                          onChange={(event) => setBoardSearch(event.target.value)}
                          placeholder="Search this client's work"
                          className="h-9 w-full rounded-md border border-[#55565a] bg-[#2a2b2d] pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#f06a6a]/70"
                        />
                      </div>
                      <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
                        {BOARD_FILTER_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            onClick={() => setBoardFilter(option.id)}
                            aria-pressed={boardFilter === option.id}
                            className={`h-8 shrink-0 rounded-md px-2.5 text-xs font-semibold transition-colors ${boardFilter === option.id ? "bg-[#454649] text-white/90" : "text-white/40 hover:bg-white/5 hover:text-white/70"}`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {actionNotice ? (
                  <div className="mx-4 mb-3 flex min-h-11 items-center gap-3 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 sm:mx-6" role="status" aria-live="polite">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                    <span className="min-w-0 flex-1">{actionNotice}</span>
                    <button onClick={() => setActionNotice("")} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-emerald-100/60 transition-colors hover:bg-emerald-500/15 hover:text-emerald-50" aria-label="Dismiss notification">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}

                {actionError ? (
                  <div className="mx-4 mb-3 flex min-h-11 items-center gap-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100 sm:mx-6" role="status" aria-live="polite">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-300" />
                    <span className="min-w-0 flex-1">{actionError}</span>
                    <button onClick={() => setActionError("")} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-100/60 transition-colors hover:bg-red-500/15 hover:text-red-50" aria-label="Dismiss notification">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="flex-1 overflow-auto custom-scrollbar">
                <DragDropContext onDragEnd={handleBoardDragEnd}>
                  <div className="flex min-w-max items-start gap-3 p-4 sm:px-5 sm:py-5">
                    {boardColumns.map((column) => (
                      <StatusBoardColumn
                        key={column.id}
                        column={column}
                        addingStatus={addingStatus}
                        newTaskTitle={newTaskTitle}
                        convertingTaskId={convertingTaskId}
                        onTaskTitleChange={setNewTaskTitle}
                        onStartAdding={() => {
                          setAddingStatus(column.id)
                          setNewTaskTitle("")
                        }}
                        onCancelAdding={() => {
                          setAddingStatus(null)
                          setNewTaskTitle("")
                        }}
                        onCreateTask={() => void handleCreateDirectTask(column.id)}
                        onOpenProject={(project) => setSelectedProjectId(project.id)}
                        onOpenTask={setSelectedTask}
                        onConvertTask={(task) => void handleConvertTask(task)}
                      />
                    ))}
                  </div>
                </DragDropContext>
              </div>
            </>
          )}
        </section>
      </div>

      <CreateClientModal isOpen={isClientModalOpen} onClose={() => setIsClientModalOpen(false)} onSuccess={handleClientSaved} />
      <CreateClientModal
        isOpen={!!editingClient}
        onClose={() => setEditingClient(null)}
        client={editingClient}
        onSuccess={handleClientSaved}
        onDeleteRequest={(client) => {
          const fullClient = clients.find((entry) => entry.id === client.id) || client
          setEditingClient(null)
          setDeletingClient(fullClient)
        }}
      />
      <CreateProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        clients={projectClientOptions}
        initialClientId={projectClientId || activeClient?.id || null}
        onSuccess={handleProjectCreated}
      />
      <ProjectBoardModal
        project={selectedProject}
        isOpen={!!selectedProject}
        onClose={() => setSelectedProjectId(null)}
        onProjectUpdated={handleProjectUpdated}
        onTaskUpdated={applyTaskUpdate}
        onOpenTask={setSelectedTask}
      />
      <TaskDrawer key={selectedTask?.id || "clients-task"} task={selectedTask} isOpen={!!selectedTask} onClose={() => setSelectedTask(null)} onTaskUpdated={applyTaskUpdate} />
      <ArchiveClientModal
        client={archiveTarget}
        isSaving={archivingClientId === archiveTarget?.id}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void handleArchiveChange()}
      />
      <DeleteClientModal client={deletingClient} isDeleting={deletingClientId === deletingClient?.id} onCancel={() => setDeletingClient(null)} onConfirm={() => void handleDeleteClient()} />
    </>
  )
}

function CompactMetric({ label, value, detail, danger = false }: { label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:block">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</div>
      <div className="flex items-baseline gap-2 sm:mt-1.5">
        <span className={`text-lg font-semibold ${danger ? "text-red-200" : "text-white/85"}`}>{value}</span>
        <span className="text-[11px] text-white/30">{detail}</span>
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
  onOpenProject,
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
  onOpenProject: (project: any) => void
  onOpenTask: (task: any) => void
  onConvertTask: (task: any) => void
}) {
  return (
    <div className="flex min-h-[320px] w-[calc(100vw-2rem)] shrink-0 flex-col rounded-lg border border-white/7 bg-[#191a1c] sm:w-[300px]">
      <div className="border-b border-white/5 px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${column.accent}`} />
            <div className="truncate text-sm font-semibold text-white/75">{column.name}</div>
            <span className="text-xs text-white/30">{column.projects.length}p / {column.tasks.length}t</span>
          </div>
          <div className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/35">{column.projects.length + column.tasks.length}</div>
        </div>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className={`flex-1 p-3 ${snapshot.isDraggingOver ? "bg-white/[0.03]" : ""}`}>
            <div className="space-y-2">
              {column.projects.map((project, index) => (
                <Draggable key={`project:${project.id}`} draggableId={`project:${project.id}`} index={index} disableInteractiveElementBlocking>
                  {(draggableProvided, draggableSnapshot) => (
                    <div ref={draggableProvided.innerRef} {...draggableProvided.draggableProps} {...draggableProvided.dragHandleProps} style={draggableProvided.draggableProps.style}>
                      <ProjectCard project={project} isDragging={draggableSnapshot.isDragging} onOpen={() => onOpenProject(project)} />
                    </div>
                  )}
                </Draggable>
              ))}

              {column.tasks.map((task, index) => (
                <Draggable key={`task:${task.id}`} draggableId={`task:${task.id}`} index={column.projects.length + index} disableInteractiveElementBlocking isDragDisabled={task.quality_required}>
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

              {!column.taskOnly && addingStatus === column.id ? (
                <div className="rounded-md border border-dashed border-white/10 bg-white/5 p-3">
                  <input
                    value={newTaskTitle}
                    onChange={(event) => onTaskTitleChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onCreateTask()
                      if (event.key === "Escape") onCancelAdding()
                    }}
                    placeholder={`Add a ${column.name.toLowerCase()} direct task`}
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                    autoFocus
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={onCreateTask} className="rounded-md bg-[#f06a6a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e45f5f]">
                      Add task
                    </button>
                    <button onClick={onCancelAdding} className="rounded-md px-3 py-1.5 text-xs font-medium text-white/45 hover:bg-white/5 hover:text-white/75">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : !column.taskOnly ? (
                <button onClick={onStartAdding} className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-white/10 px-3 text-xs font-semibold text-white/30 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white/65">
                  <Plus className="h-3.5 w-3.5" />
                  Add direct task
                </button>
              ) : null}

              {column.projects.length === 0 && column.tasks.length === 0 && addingStatus !== column.id ? (
                <div className="rounded-md border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/25">Nothing here yet.</div>
              ) : null}
            </div>
          </div>
        )}
      </Droppable>
    </div>
  )
}

function ProjectCard({ project, isDragging, onOpen }: { project: any; isDragging: boolean; onOpen: () => void }) {
  const completedTasks = countCompletedTasks(project.tasks)
  const progress = project.tasks.length > 0 ? Math.round((completedTasks / project.tasks.length) * 100) : 0
  const overdueCount = project.tasks.filter(isTaskOverdue).length

  return (
    <button onClick={onOpen} className={`w-full rounded-md border border-white/10 bg-[#252628] p-3 text-left transition-all ${isDragging ? "rotate-1 border-white/25 shadow-2xl shadow-black/30" : "hover:border-white/20 hover:bg-[#292a2c]"}`}>
      <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#bdb3ff]">
        <FolderKanban className="h-3 w-3" />
        Project
      </div>
      <div dir="auto" className="text-sm font-semibold leading-5 text-white/90">{project.name}</div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/40">
        <span>{project.tasks.length} tasks</span>
        <span>{progress}% complete</span>
        {project.deadline ? (
          <span className={`inline-flex items-center gap-1 ${isProjectDeadlineOverdue(project) ? "text-red-300" : ""}`}>
            <Calendar className="h-3 w-3" />
            {format(new Date(project.deadline), "MMM d")}
          </span>
        ) : null}
        {overdueCount > 0 ? <span className="text-red-300">{overdueCount} overdue</span> : null}
      </div>
    </button>
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
    <div className={`group rounded-md border border-white/7 bg-[#232426] p-3 transition-all ${isDragging ? "rotate-1 border-white/20 shadow-2xl" : "hover:border-white/15 hover:bg-[#2a2b2d]"}`}>
      <button onClick={onOpen} className="w-full text-left">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div dir="auto" className={`w-full text-[13px] font-medium leading-5 ${task.status === "complete" ? "text-white/35 line-through" : "text-white/85"}`}>{task.title}</div>
          <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${task.status === "complete" ? "fill-emerald-500 text-emerald-500" : "text-white/15"}`} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/35">
          <span className="inline-flex items-center gap-1 text-[#a9c4ff]">
            <Briefcase className="h-3 w-3" />
            Direct task
          </span>
          {task.assignee?.full_name ? <span>{task.assignee.full_name}</span> : null}
          {task.due_date ? (
            <span className={`inline-flex items-center gap-1 ${isTaskOverdue(task) ? "text-red-300" : ""}`}>
              <Calendar className="h-3 w-3" />
              {format(new Date(task.due_date), "MMM d")}
            </span>
          ) : null}
        </div>
      </button>

      <div className="mt-2.5 flex min-h-7 items-center justify-between gap-3 border-t border-white/5 pt-2.5">
        {task.priority ? <span className="text-[10px] font-semibold uppercase text-white/45">{task.priority}</span> : <span />}
        <button
          onClick={(event) => {
            event.stopPropagation()
            onConvert()
          }}
          disabled={isConverting}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold text-blue-200 transition-colors hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-60 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        >
          <ArrowUpCircle className="h-3.5 w-3.5" />
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="max-h-dvh w-full overflow-y-auto overscroll-contain rounded-t-xl border border-white/10 bg-[#1f2022] p-4 shadow-2xl custom-scrollbar sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:rounded-xl sm:p-6">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${isRestoring ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>
          {isRestoring ? <RotateCcw className="h-5 w-5" /> : <Archive className="h-5 w-5" />}
        </div>
        <h3 className="mt-4 break-words text-xl font-semibold text-white/90">
          {isRestoring ? `Restore ${client.name}?` : `Archive ${client.name}?`}
        </h3>
        <p className="mt-3 text-sm leading-6 text-white/45">
          {isRestoring
            ? "The client will return to your active client list."
            : "The client will disappear from active lists. Its projects, tasks, and history will stay intact and can be restored at any time."}
        </p>
        <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.03] p-3 text-xs leading-5 text-white/45">
          {client.projects.length} projects and {client.tasks.length} direct tasks will remain saved.
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button onClick={onCancel} disabled={isSaving} className="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 disabled:opacity-60 sm:w-auto">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isSaving}
            className={`w-full rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 sm:w-auto ${isRestoring ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-600 hover:bg-amber-500"}`}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="max-h-dvh w-full overflow-y-auto overscroll-contain rounded-t-xl border border-white/10 bg-[#1f2022] p-4 shadow-2xl custom-scrollbar sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:rounded-xl sm:p-6">
        <h3 className="break-words text-xl font-semibold text-white/90">Delete {client.name}?</h3>
        <p className="mt-3 text-sm leading-6 text-white/45">This permanently removes the client together with its nested projects and direct tasks.</p>
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
          <div>{client.projects.length} projects will be deleted.</div>
          <div>{client.tasks.length} direct tasks will be deleted.</div>
        </div>
        <div className="mt-4 space-y-2">
          <label htmlFor="delete-client-confirmation" className="block break-words text-xs font-semibold uppercase tracking-wide text-white/45">
            Type {client.name} to confirm
          </label>
          <input
            id="delete-client-confirmation"
            value={confirmationName}
            onChange={(event) => setConfirmationName(event.target.value)}
            placeholder={client.name}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/20"
          />
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button onClick={onCancel} disabled={isDeleting} className="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 disabled:opacity-60 sm:w-auto">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isDeleting || confirmationName !== client.name} className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-60 sm:w-auto">
            {isDeleting ? "Deleting..." : "Delete Client"}
          </button>
        </div>
      </div>
    </div>
  )
}
