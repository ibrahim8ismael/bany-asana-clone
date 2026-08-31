"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { format, isPast, isToday } from "date-fns"
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd"
import {
  Archive,
  ArrowUpCircle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderKanban,
  LayoutGrid,
  LayoutList,
  Loader2,
  PencilLine,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react"
import {
  convertDirectTaskToProject,
  createTask,
  deleteClient,
  deleteProject,
  getClientTaskBoardColumn,
  getClientTaskBoardSummary,
  getClientTaskPage,
  getProjectMemberManagement,
  setClientArchived,
  updateProject,
  updateTask,
} from "@/actions/server-actions"
import type { EditableClient } from "@/components/create-client-modal"
import AddClientMemberModal, { type ClientMember } from "@/components/add-client-member-modal"
import type { ProjectMemberManagementData } from "@/components/project-members-manager"
import { keepDirectClientTasks } from "@/lib/client-hierarchy"
import {
  CLIENT_TASK_LAYOUT_STORAGE_KEY,
  insertCreatedTaskIntoBoardColumn,
  moveTaskBetweenBoardColumns,
  reconcileTaskAcrossBoardColumns,
  type ClientTaskBoardColumnState,
  type ClientTaskLayout,
} from "@/lib/client-task-board"
import {
  deriveProjectCompletionStatus,
  TASK_WORKFLOW_STAGES,
  type TaskWorkflowStageId,
  validateManualTaskTransition,
} from "@/lib/workflow"

const CreateClientModal = dynamic(() => import("@/components/create-client-modal"), { ssr: false })
const CreateProjectModal = dynamic(() => import("@/components/create-project-modal"), { ssr: false })
const ProjectMembersManager = dynamic(() => import("@/components/project-members-manager"), { ssr: false })
const TaskDrawer = dynamic(() => import("@/components/task-drawer"), { ssr: false })

type ClientScope = "active" | "archived"
type WorkScope = "project" | "direct"
type ClientTaskScope = "active" | "archived"

function isTaskOverdue(task: any) {
  return Boolean(task.due_date)
    && isPast(new Date(task.due_date))
    && !isToday(new Date(task.due_date))
    && task.status !== "complete"
}

function countCompletedTasks(tasks: any[]) {
  return tasks.filter((task) => task.status === "complete").length
}

function reconcileProject(project: any) {
  return {
    ...project,
    status: deriveProjectCompletionStatus(
      project.status,
      project.tasks.filter((task: any) => !task.archived).map((task: any) => task.status)
    ),
  }
}

function reconcileClients(clients: any[]) {
  return clients.map((client) => ({
    ...client,
    projects: client.projects.map(reconcileProject),
    // Client.tasks is the direct-task collection. Defensive filtering prevents corrupt legacy rows
    // with a project_id from being represented as direct work.
    tasks: keepDirectClientTasks(client.tasks),
  }))
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

function canStartManualDrag(task: any) {
  return TASK_WORKFLOW_STAGES.some((stage) =>
    stage.id !== task.status
    && validateManualTaskTransition({
      from: task.status,
      to: stage.id,
      qualityRequired: Boolean(task.quality_required),
      qualityState: task.quality_state || "not_required",
    }) === null
  )
}

export default function ClientsOverviewClient({ initialClients }: { initialClients: any[] }) {
  const searchParams = useSearchParams()
  const normalizedInitialClients = useMemo(() => reconcileClients(initialClients), [initialClients])
  const requestedClientId = searchParams?.get("clientId") || null
  const [clients, setClients] = useState(normalizedInitialClients)
  const [clientScope, setClientScope] = useState<ClientScope>("active")
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    requestedClientId || normalizedInitialClients.find((client) => !client.archived)?.id || null
  )
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [workScope, setWorkScope] = useState<WorkScope>("project")
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [search, setSearch] = useState("")
  const [clientTaskScope, setClientTaskScope] = useState<ClientTaskScope>("active")
  const [clientTaskSearch, setClientTaskSearch] = useState("")
  const [debouncedClientTaskSearch, setDebouncedClientTaskSearch] = useState("")
  const [clientTaskPage, setClientTaskPage] = useState(1)
  const [clientTaskData, setClientTaskData] = useState<any | null>(null)
  const [clientTasksLoading, setClientTasksLoading] = useState(false)
  const [clientTasksError, setClientTasksError] = useState("")
  const [addingStage, setAddingStage] = useState<TaskWorkflowStageId | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [actionError, setActionError] = useState("")
  const [actionNotice, setActionNotice] = useState("")
  const [isClientModalOpen, setIsClientModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<EditableClient | null>(null)
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<any | null>(null)
  const [deletingProject, setDeletingProject] = useState<any | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<any | null>(null)
  const [deletingClient, setDeletingClient] = useState<any | null>(null)
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false)
  const [clientMembersMap, setClientMembersMap] = useState<Record<string, ClientMember[]>>({})
  const [savingClientId, setSavingClientId] = useState<string | null>(null)
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null)
  const [convertingTaskId, setConvertingTaskId] = useState<string | null>(null)
  const [clientTaskLayout, setClientTaskLayout] = useState<ClientTaskLayout>("table")
  const [boardCounts, setBoardCounts] = useState<Record<string, number> | null>(null)
  const [boardColumns, setBoardColumns] = useState<Record<string, ClientTaskBoardColumnState>>(() =>
    Object.fromEntries(TASK_WORKFLOW_STAGES.map((stage) => [stage.id, {
      tasks: [],
      page: 1,
      total: 0,
      totalPages: 1,
      loading: false,
    } as ClientTaskBoardColumnState])))
  const [boardSummaryLoading, setBoardSummaryLoading] = useState(false)
  const [boardError, setBoardError] = useState("")

  useEffect(() => {
    const stored = window.localStorage.getItem(CLIENT_TASK_LAYOUT_STORAGE_KEY)
    if (stored === "board" || stored === "table") setClientTaskLayout(stored)
  }, [])

  const handleClientTaskLayoutChange = (layout: ClientTaskLayout) => {
    setClientTaskLayout(layout)
    window.localStorage.setItem(CLIENT_TASK_LAYOUT_STORAGE_KEY, layout)
  }

  useEffect(() => {
    if (!requestedClientId) return
    const requestedClient = clients.find((client) => client.id === requestedClientId)
    if (!requestedClient) return

    setSelectedClientId(requestedClient.id)
    setClientScope(requestedClient.archived ? "archived" : "active")
    setSelectedProjectId(null)
    setWorkScope(requestedClient.projects.length > 0 ? "project" : "direct")
  }, [clients, requestedClientId])

  const visibleClients = useMemo(() => clients.filter((client) =>
    clientScope === "archived" ? Boolean(client.archived) : !client.archived
  ), [clientScope, clients])

  const activeClient = useMemo(() =>
    clients.find((client) => client.id === selectedClientId)
    || visibleClients[0]
    || null,
  [clients, selectedClientId, visibleClients])

  const selectedProject = useMemo(() =>
    activeClient?.projects.find((project: any) => project.id === selectedProjectId)
    || activeClient?.projects[0]
    || null,
  [activeClient, selectedProjectId])

  useEffect(() => {
    if (!activeClient) return
    if (!selectedProjectId || !activeClient.projects.some((project: any) => project.id === selectedProjectId)) {
      setSelectedProjectId(activeClient.projects[0]?.id || null)
      if (activeClient.projects.length === 0) setWorkScope("direct")
    }
  }, [activeClient, selectedProjectId])

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedClientTaskSearch(clientTaskSearch.trim()),
      250,
    )
    return () => window.clearTimeout(timeoutId)
  }, [clientTaskSearch])

  useEffect(() => {
    setClientTaskScope("active")
    setClientTaskSearch("")
    setDebouncedClientTaskSearch("")
    setClientTaskPage(1)
    setClientTaskData(null)
    setClientTasksError("")
  }, [activeClient?.id])

  useEffect(() => {
    if (!activeClient?.id) return

    let cancelled = false
    setClientTasksLoading(true)
    setClientTasksError("")

    void getClientTaskPage({
      clientId: activeClient.id,
      scope: clientTaskScope,
      page: clientTaskPage,
      search: debouncedClientTaskSearch,
    }).then((result) => {
      if (cancelled) return
      if (!result.success) {
        setClientTaskData(null)
        setClientTasksError(result.error || "Client tasks could not be loaded")
        return
      }
      setClientTaskData(result.data)
      if (clientTaskPage > result.data.totalPages) {
        setClientTaskPage(result.data.totalPages)
      }
    }).catch(() => {
      if (!cancelled) {
        setClientTaskData(null)
        setClientTasksError("Client tasks could not be loaded")
      }
    }).finally(() => {
      if (!cancelled) setClientTasksLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [activeClient?.id, clientTaskPage, clientTaskScope, debouncedClientTaskSearch])

  const boardActive = clientTaskLayout === "board"

  useEffect(() => {
    if (!boardActive || !activeClient?.id) return

    let cancelled = false
    setBoardError("")
    setBoardCounts(null)
    setBoardSummaryLoading(true)
    setBoardColumns(Object.fromEntries(TASK_WORKFLOW_STAGES.map((stage) => [stage.id, {
      tasks: [],
      page: 1,
      total: 0,
      totalPages: 1,
      loading: true,
    } as ClientTaskBoardColumnState])))

    void getClientTaskBoardSummary({
      clientId: activeClient.id,
      scope: clientTaskScope,
      search: debouncedClientTaskSearch,
    }).then((result) => {
      if (cancelled) return
      if (!result.success) {
        setBoardError(result.error || "Board totals could not be loaded")
        return
      }
      setBoardCounts(result.data.counts)
    }).finally(() => {
      if (!cancelled) setBoardSummaryLoading(false)
    })

    for (const stage of TASK_WORKFLOW_STAGES) {
      void getClientTaskBoardColumn({
        clientId: activeClient.id,
        status: stage.id,
        scope: clientTaskScope,
        page: 1,
        search: debouncedClientTaskSearch,
      }).then((result) => {
        if (cancelled) return
        setBoardColumns((current) => ({
          ...current,
          [stage.id]: result.success
            ? {
                tasks: result.data.tasks,
                page: result.data.page,
                total: result.data.total,
                totalPages: result.data.totalPages,
                loading: false,
              }
            : { ...current[stage.id], loading: false },
        }))
        if (!result.success && !cancelled) setBoardError(result.error || "Board tasks could not be loaded")
      })
    }

    return () => {
      cancelled = true
    }
  }, [activeClient?.id, boardActive, clientTaskScope, debouncedClientTaskSearch])

  const handleLoadMoreBoardColumn = async (stageId: TaskWorkflowStageId) => {
    if (!activeClient?.id) return
    const column = boardColumns[stageId]
    if (!column || column.loading || column.page >= column.totalPages) return

    const nextPage = column.page + 1
    setBoardColumns((current) => ({ ...current, [stageId]: { ...current[stageId], loading: true } }))
    const result = await getClientTaskBoardColumn({
      clientId: activeClient.id,
      status: stageId,
      scope: clientTaskScope,
      page: nextPage,
      search: debouncedClientTaskSearch,
    })
    setBoardColumns((current) => {
      const existing = current[stageId]
      if (!result.success) return { ...current, [stageId]: { ...existing, loading: false } }
      const knownIds = new Set(existing.tasks.map((task: any) => task.id))
      return {
        ...current,
        [stageId]: {
          tasks: [...existing.tasks, ...result.data.tasks.filter((task: any) => !knownIds.has(task.id))],
          page: result.data.page,
          total: result.data.total,
          totalPages: result.data.totalPages,
          loading: false,
        },
      }
    })
  }

  useEffect(() => {
    const taskId = searchParams?.get("taskId")
    if (!taskId || selectedTask) return
    const task = findTask(clients, taskId)
    if (!task) return
    const timeoutId = window.setTimeout(() => setSelectedTask(task), 0)
    return () => window.clearTimeout(timeoutId)
  }, [clients, searchParams, selectedTask])

  const clientTaskTotal = clientTaskData
    ? clientTaskData.counts.active + clientTaskData.counts.archived
    : null

  const scopedTasks = useMemo(() => {
    const source = workScope === "project" ? selectedProject?.tasks || [] : activeClient?.tasks || []
    const term = search.trim().toLowerCase()
    if (!term) return source
    return source.filter((task: any) =>
      [task.title, task.description_rich_text, task.assignee?.full_name]
        .some((value) => value?.toLowerCase().includes(term))
    )
  }, [activeClient, search, selectedProject, workScope])

  const workflowColumns = useMemo(() => TASK_WORKFLOW_STAGES.map((stage) => ({
    ...stage,
    tasks: scopedTasks.filter((task: any) => task.status === stage.id),
  })), [scopedTasks])

  const applyTaskUpdate = (updatedTask: any) => {
    setClients((previous) => reconcileClients(previous.map((client) => ({
      ...client,
      tasks: client.tasks.map((task: any) => task.id === updatedTask.id ? { ...task, ...updatedTask } : task),
      projects: client.projects.map((project: any) => ({
        ...project,
        tasks: project.tasks.map((task: any) => task.id === updatedTask.id ? { ...task, ...updatedTask } : task),
      })),
    }))))
    setClientTaskData((current: any) => current ? {
      ...current,
      tasks: current.tasks.map((task: any) => task.id === updatedTask.id
        ? { ...task, ...updatedTask, client_project: updatedTask.project || task.client_project }
        : task),
    } : current)
    setSelectedTask((current: any) => current?.id === updatedTask.id ? { ...current, ...updatedTask } : current)
    setBoardColumns((current) => {
      const next = reconcileTaskAcrossBoardColumns(current, updatedTask)
      return next || current
    })
    if (!activeClient?.id) return
    void getClientTaskBoardSummary({
      clientId: activeClient.id,
      scope: clientTaskScope,
      search: debouncedClientTaskSearch,
    }).then((result) => {
      if (result.success) setBoardCounts(result.data.counts)
    }).catch(() => {})
  }

  const handleBoardDragEnd = async (dropResult: DropResult) => {
    const { destination, source, draggableId } = dropResult
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const fromColumn = boardColumns[source.droppableId]
    const task = fromColumn?.tasks.find((entry: any) => entry.id === draggableId)
    if (!task) return

    const transitionError = validateManualTaskTransition({
      from: task.status,
      to: destination.droppableId,
      qualityRequired: Boolean(task.quality_required),
      qualityState: task.quality_state || "not_required",
    })
    if (transitionError) {
      setActionError(transitionError)
      return
    }

    const optimistic = moveTaskBetweenBoardColumns(boardColumns, draggableId, source.droppableId, destination.droppableId)
    if (!optimistic) return
    setBoardColumns(optimistic.columns)
    setActionError("")

    const actionResult = await updateTask(task.id, { status: destination.droppableId as any })
    if (!actionResult.success || !actionResult.task) {
      setBoardColumns(boardColumns)
      setActionError(actionResult.error || "The task could not be moved")
      return
    }
    applyTaskUpdate(actionResult.task)
  }

  const startBoardQuickAdd = (stageId: TaskWorkflowStageId) => {
    setActionError("")
    setAddingStage(stageId)
    setNewTaskTitle("")
  }

  const cancelBoardQuickAdd = () => {
    setAddingStage(null)
    setNewTaskTitle("")
  }

  const submitBoardQuickAdd = async (stageId: TaskWorkflowStageId) => {
    if (!activeClient) return
    if (clientTaskScope !== "active") {
      setActionError("New tasks are created in Active tasks")
      cancelBoardQuickAdd()
      return
    }
    const stageDefinition = TASK_WORKFLOW_STAGES.find((entry) => entry.id === stageId)!
    if (!stageDefinition.manualTransition) {
      setActionError(`${stageDefinition.label} is controlled by the quality workflow`)
      cancelBoardQuickAdd()
      return
    }
    const title = newTaskTitle.trim()
    if (!title) return

    const result = await createTask({
      title,
      status: stageId,
      client_id: activeClient.id,
    })
    if (!result.success || !result.task) {
      setActionError(result.error || "The task could not be created")
      return
    }

    const createdTask = { ...result.task, client_project: result.task.project || null }
    setClients((previous) => reconcileClients(previous.map((client) => client.id === activeClient.id
      ? { ...client, tasks: [createdTask, ...client.tasks] }
      : client)))
    setBoardColumns((current) => insertCreatedTaskIntoBoardColumn(current, createdTask) || current)
    setBoardCounts((current) => current
      ? { ...current, [stageId]: (current[stageId] ?? 0) + 1 }
      : current)
    setClientTaskData((current: any) => {
      if (!current) return current
      const matchesSearch = !debouncedClientTaskSearch
        || createdTask.title.toLowerCase().includes(debouncedClientTaskSearch.toLowerCase())
      return {
        ...current,
        counts: current.counts
          ? { ...current.counts, active: (current.counts.active ?? 0) + 1 }
          : current.counts,
        total: matchesSearch ? current.total + 1 : current.total,
        totalPages: matchesSearch
          ? Math.max(1, Math.ceil((current.total + 1) / current.pageSize))
          : current.totalPages,
        tasks: matchesSearch && current.page === 1
          ? [createdTask, ...current.tasks].slice(0, current.pageSize)
          : current.tasks,
      }
    })
    cancelBoardQuickAdd()
    setActionNotice(`Task added to ${stageDefinition.label}`)
  }

  const handleDragEnd = async (dropResult: DropResult) => {
    const { destination, source, draggableId } = dropResult
    if (!destination || destination.droppableId === source.droppableId) return
    const task = scopedTasks.find((entry: any) => entry.id === draggableId)
    if (!task) return

    const transitionError = validateManualTaskTransition({
      from: task.status,
      to: destination.droppableId,
      qualityRequired: Boolean(task.quality_required),
      qualityState: task.quality_state || "not_required",
    })
    if (transitionError) {
      setActionError(transitionError)
      return
    }

    setActionError("")
    const actionResult = await updateTask(task.id, { status: destination.droppableId })
    if (!actionResult.success || !actionResult.task) {
      setActionError(actionResult.error || "The task could not be moved")
      return
    }
    applyTaskUpdate(actionResult.task)
  }

  const handleCreateTask = async (stage: TaskWorkflowStageId) => {
    if (!activeClient) return
    const title = newTaskTitle.trim()
    if (!title) return
    const stageDefinition = TASK_WORKFLOW_STAGES.find((entry) => entry.id === stage)!
    if (!stageDefinition.manualTransition) {
      setActionError(`${stageDefinition.label} is entered through the quality workflow`)
      return
    }

    const project = workScope === "project" ? selectedProject : null
    if (workScope === "project" && !project) return
    const result = await createTask({
      title,
      status: stage,
      client_id: activeClient.id,
      project_id: project?.id,
      section_id: project?.sections?.[0]?.id,
    })
    if (!result.success || !result.task) {
      setActionError(result.error || "The task could not be created")
      return
    }

    setClients((previous) => reconcileClients(previous.map((client) => {
      if (client.id !== activeClient.id) return client
      if (!project) return { ...client, tasks: [result.task, ...client.tasks] }
      return {
        ...client,
        projects: client.projects.map((entry: any) =>
          entry.id === project.id ? { ...entry, tasks: [result.task, ...entry.tasks] } : entry
        ),
      }
    })))
    setAddingStage(null)
    setNewTaskTitle("")
    setActionNotice(`Task added to ${stageDefinition.label}`)
  }

  const handleConvertTask = async (task: any) => {
    setConvertingTaskId(task.id)
    setActionError("")
    const result = await convertDirectTaskToProject(task.id)
    setConvertingTaskId(null)
    if (!result.success || !result.project || !result.task) {
      setActionError(result.error || "The task could not be converted")
      return
    }
    setClients((previous) => reconcileClients(previous.map((client) => client.id === task.client_id
      ? {
          ...client,
          tasks: client.tasks.filter((entry: any) => entry.id !== task.id),
          projects: [{ ...result.project, tasks: [result.task], sections: result.project.sections || [] }, ...client.projects],
        }
      : client)))
    setSelectedProjectId(result.project.id)
    setWorkScope("project")
    setActionNotice("Direct task converted to a project")
  }

  const handleClientSaved = (savedClient: EditableClient) => {
    setClients((previous) => reconcileClients(previous.some((client) => client.id === savedClient.id)
      ? previous.map((client) => client.id === savedClient.id ? { ...client, ...savedClient } : client)
      : [{ ...savedClient, projects: [], tasks: [] }, ...previous]))
    setSelectedClientId(savedClient.id)
    setClientScope(savedClient.archived ? "archived" : "active")
    setIsClientModalOpen(false)
    setEditingClient(null)
  }

  const handleProjectCreated = (project: any) => {
    setClients((previous) => reconcileClients(previous.map((client) => client.id === project.client_id
      ? { ...client, projects: [{ ...project, tasks: [], sections: project.sections || [] }, ...client.projects] }
      : client)))
    setSelectedProjectId(project.id)
    setWorkScope("project")
    setIsProjectModalOpen(false)
  }

  const handleProjectUpdated = (updatedProject: any) => {
    setClients((previous) => reconcileClients(previous.map((client) => ({
      ...client,
      projects: client.projects.map((project: any) =>
        project.id === updatedProject.id ? { ...project, ...updatedProject } : project
      ),
    }))))
    setEditingProject(null)
    setActionNotice("Project updated")
  }

  const handleDeleteProject = async () => {
    if (!deletingProject || !activeClient) return
    setSavingProjectId(deletingProject.id)
    setActionError("")
    const result = await deleteProject(deletingProject.id)
    setSavingProjectId(null)
    if (!result.success) {
      setActionError(result.error || "The project could not be deleted")
      return
    }

    const remainingProjects = activeClient.projects.filter((project: any) => project.id !== deletingProject.id)
    setClients((previous) => previous.map((client) => client.id === activeClient.id
      ? { ...client, projects: remainingProjects }
      : client))
    if (selectedProjectId === deletingProject.id) {
      setSelectedProjectId(remainingProjects[0]?.id || null)
      if (remainingProjects.length === 0) setWorkScope("direct")
    }
    setDeletingProject(null)
    setActionNotice(`Project deleted${result.deletedTasks ? ` with ${result.deletedTasks} task${result.deletedTasks === 1 ? "" : "s"}` : ""}`)
  }

  const handleArchive = async () => {
    if (!archiveTarget) return
    setSavingClientId(archiveTarget.id)
    const archived = !archiveTarget.archived
    const result = await setClientArchived(archiveTarget.id, archived)
    setSavingClientId(null)
    if (result.success) {
      setClients((previous) => previous.map((client) => client.id === archiveTarget.id ? { ...client, archived } : client))
    } else setActionError(result.error || "Client archive state could not be changed")
    setArchiveTarget(null)
  }

  const handleDelete = async () => {
    if (!deletingClient) return
    setSavingClientId(deletingClient.id)
    const result = await deleteClient(deletingClient.id)
    setSavingClientId(null)
    if (result.success) {
      setClients((previous) => previous.filter((client) => client.id !== deletingClient.id))
      setSelectedClientId(null)
    } else setActionError(result.error || "Client could not be deleted")
    setDeletingClient(null)
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#18181b]">
        <header className="shrink-0 border-b border-[#3f3f46] bg-[#202023] px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-[#3f3f46] bg-[#18181b] p-1">
                {(["active", "archived"] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => { setClientScope(scope); setSelectedClientId(null) }}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${clientScope === scope ? "bg-[#27272a] text-white" : "text-[#a1a1aa]"}`}
                  >
                    {scope === "active" ? "Active" : "Archived"} ({clients.filter((client) => scope === "archived" ? client.archived : !client.archived).length})
                  </button>
                ))}
              </div>
              <div className="flex max-w-[560px] gap-1.5 overflow-x-auto custom-scrollbar">
                {visibleClients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClientId(client.id)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${activeClient?.id === client.id ? "border-[#0075de]/60 bg-[#0075de]/20 text-white" : "border-[#3f3f46] bg-[#18181b] text-[#a1a1aa]"}`}
                  >
                    {client.name}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setIsClientModalOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#0075de] px-3.5 text-xs font-semibold text-white">
              <Plus className="h-3.5 w-3.5" /> New client
            </button>
          </div>
        </header>

        {!activeClient ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div><h1 className="text-xl font-semibold text-white">No clients here yet</h1><p className="mt-2 text-sm text-[#a1a1aa]">Create a client to organize projects and direct work.</p></div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3f3f46] bg-[#202023] px-4 py-4 sm:px-6">
              <div>
                <h1 className="text-lg font-semibold text-white">{activeClient.name}</h1>
                <p className="mt-0.5 text-xs text-[#a1a1aa]">
                  {activeClient.projects.length} projects · {clientTaskTotal === null ? "Loading task totals…" : `${clientTaskTotal} tasks`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setIsMemberModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-[#3f3f46] px-3 py-1.5 text-xs font-semibold text-white"><UserPlus className="h-3.5 w-3.5" /> People</button>
                <button onClick={() => setEditingClient(activeClient)} className="inline-flex items-center gap-1.5 rounded-md border border-[#3f3f46] px-3 py-1.5 text-xs text-white"><PencilLine className="h-3.5 w-3.5" /> Edit</button>
                <button onClick={() => setArchiveTarget(activeClient)} className="inline-flex items-center gap-1.5 rounded-md border border-[#3f3f46] px-3 py-1.5 text-xs text-[#a1a1aa]">{activeClient.archived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}{activeClient.archived ? "Restore" : "Archive"}</button>
                <button onClick={() => setDeletingClient(activeClient)} className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#131316] p-6 lg:p-10 custom-scrollbar">
              <div className="mx-auto max-w-6xl space-y-12">
                {actionError ? (
                  <div className="flex items-center gap-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-medium text-rose-300">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20"><Trash2 className="h-3 w-3 text-rose-400" /></div>
                    {actionError}
                  </div>
                ) : null}
                {actionNotice ? (
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-300">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20"><CheckCircle2 className="h-3 w-3 text-emerald-400" /></div>
                    {actionNotice}
                  </div>
                ) : null}

                <section aria-labelledby="client-tasks-heading">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h2 id="client-tasks-heading" className="text-xl font-semibold tracking-tight text-white">Tasks</h2>
                      <p className="mt-1 text-sm text-[#a1a1aa]">Direct work and tasks across every project belonging to {activeClient.name}</p>
                    </div>
                    <label className="block">
                      <span className="sr-only">Search client tasks</span>
                      <input
                        value={clientTaskSearch}
                        onChange={(event) => {
                          setClientTaskSearch(event.target.value)
                          setClientTaskPage(1)
                        }}
                        placeholder="Search client tasks"
                        className="h-9 w-64 max-w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-3 text-xs text-white outline-none placeholder:text-[#71717a] focus:border-[#0075de]"
                      />
                    </label>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-[#27272a] bg-[#18181b]">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#27272a] px-4 py-3">
                      <div role="tablist" aria-label="Client task archive state" className="flex rounded-lg border border-[#3f3f46] bg-[#131316] p-1">
                        {(["active", "archived"] as const).map((scope) => (
                          <button
                            key={scope}
                            type="button"
                            role="tab"
                            aria-selected={clientTaskScope === scope}
                            onClick={() => {
                              setClientTaskScope(scope)
                              setClientTaskPage(1)
                            }}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${clientTaskScope === scope ? "bg-[#27272a] text-white" : "text-[#a1a1aa] hover:text-white"}`}
                          >
                            {scope === "active" ? "Active tasks" : "Archived tasks"} ({clientTaskData?.counts?.[scope] ?? "…"})
                          </button>
                        ))}
                      </div>
                      {clientTaskData && clientTaskLayout === "table" ? (
                        <span className="text-xs text-[#71717a]">
                          {clientTaskData.total === 0
                            ? "No matching tasks"
                            : `${(clientTaskData.page - 1) * clientTaskData.pageSize + 1}–${Math.min(clientTaskData.page * clientTaskData.pageSize, clientTaskData.total)} of ${clientTaskData.total}`}
                        </span>
                      ) : null}
                      <div role="tablist" aria-label="Client task layout" className="flex rounded-lg border border-[#3f3f46] bg-[#131316] p-1">
                        {(["table", "board"] as const).map((layout) => (
                          <button
                            key={layout}
                            type="button"
                            role="tab"
                            aria-selected={clientTaskLayout === layout}
                            onClick={() => handleClientTaskLayoutChange(layout)}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${clientTaskLayout === layout ? "bg-[#27272a] text-white" : "text-[#a1a1aa] hover:text-white"}`}
                          >
                            {layout === "table" ? <LayoutList className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
                            {layout === "table" ? "Table" : "Board"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {boardError ? (
                      <p role="alert" className="m-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{boardError}</p>
                    ) : null}

                    {clientTaskLayout === "board" ? (
                      <DragDropContext onDragEnd={handleBoardDragEnd}>
                        <div className="flex min-w-max items-start gap-3 overflow-x-auto p-3 custom-scrollbar">
                          {TASK_WORKFLOW_STAGES.map((stage) => {
                            const column = boardColumns[stage.id]
                            const total = boardCounts?.[stage.id] ?? column?.total ?? 0
                            return (
                              <div key={stage.id} className="flex max-h-[70vh] w-[280px] shrink-0 flex-col rounded-xl border border-[#3f3f46] bg-[#202023] sm:w-[300px]">
                                <div className="border-b border-[#3f3f46] p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <h3 className="truncate text-xs font-bold uppercase tracking-wider text-[#f4f4f5]">{stage.label}</h3>
                                      <span className="shrink-0 rounded-full bg-[#18181b] px-1.5 py-0.5 text-[10px] font-bold text-[#a1a1aa]" aria-label={`${total} tasks in ${stage.label}`}>
                                        {boardSummaryLoading && boardCounts === null ? "…" : total}
                                      </span>
                                    </div>
                                    {stage.manualTransition && clientTaskScope === "active" ? (
                                      <button
                                        type="button"
                                        onClick={() => startBoardQuickAdd(stage.id)}
                                        aria-label={`Add task to ${stage.label}`}
                                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#3f3f46] text-[#a1a1aa] transition-colors hover:border-[#0075de]/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0075de]"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                      </button>
                                    ) : !stage.manualTransition ? (
                                      <span
                                        aria-label={`Tasks cannot be added directly to ${stage.label}; it is controlled by the quality workflow`}
                                        title={`${stage.label} is controlled by the quality workflow`}
                                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#71717a]"
                                      >
                                        <ShieldCheck className="h-3.5 w-3.5" />
                                      </span>
                                    ) : null}
                                  </div>
                                  {addingStage === stage.id ? (
                                    <form
                                      onSubmit={(event) => {
                                        event.preventDefault()
                                        void submitBoardQuickAdd(stage.id)
                                      }}
                                      className="mt-2"
                                    >
                                      <input
                                        autoFocus
                                        value={newTaskTitle}
                                        onChange={(event) => setNewTaskTitle(event.target.value)}
                                        onKeyDown={(event) => {
                                          if (event.key === "Escape") cancelBoardQuickAdd()
                                        }}
                                        placeholder={`Add task to ${stage.label}…`}
                                        aria-label={`New task title for ${stage.label}`}
                                        className="w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-[#71717a] focus:border-[#0075de]"
                                      />
                                      <div className="mt-2 flex items-center gap-2">
                                        <button type="submit" disabled={!newTaskTitle.trim()} className="rounded-full bg-[#0075de] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">Add</button>
                                        <button type="button" onClick={cancelBoardQuickAdd} className="rounded-md px-2 py-1 text-xs font-medium text-[#a1a1aa] hover:text-white">Cancel</button>
                                      </div>
                                    </form>
                                  ) : null}
                                </div>
                                <Droppable droppableId={stage.id} isDropDisabled={!stage.manualTransition}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.droppableProps}
                                      className={`flex-1 space-y-2 overflow-y-auto p-2.5 custom-scrollbar transition-colors ${snapshot.isDraggingOver ? "bg-[#18181b]/60" : ""}`}
                                    >
                                      {(column?.tasks || []).map((task: any, index: number) => {
                                        const stageDefinition = TASK_WORKFLOW_STAGES.find((entry) => entry.id === task.status)
                                        return (
                                          <Draggable key={task.id} draggableId={task.id} index={index}>
                                            {(dragProvided, dragSnapshot) => (
                                              <div
                                                ref={dragProvided.innerRef}
                                                {...dragProvided.draggableProps}
                                                {...dragProvided.dragHandleProps}
                                                onClick={() => setSelectedTask(task)}
                                                onKeyDown={(event) => {
                                                  if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault()
                                                    setSelectedTask(task)
                                                  }
                                                }}
                                                role="button"
                                                tabIndex={0}
                                                className={`cursor-pointer rounded-lg border border-[#3f3f46] bg-[#202023] p-2.5 shadow-sm transition-all hover:border-[#0075de]/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0075de] ${dragSnapshot.isDragging ? "z-50 rotate-1 border-[#0075de]/50 bg-[#27272a] shadow-xl" : ""}`}
                                              >
                                                <div className="flex items-start justify-between gap-2">
                                                  <h4 className={`text-xs font-semibold leading-snug ${task.status === "complete" ? "text-[#71717a] line-through" : "text-[#f4f4f5]"}`}>{task.title}</h4>
                                                  {task.quality_required && task.status !== "complete" ? (
                                                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-label="Quality required" />
                                                  ) : null}
                                                </div>
                                                <div className="mt-2 flex items-center gap-1.5">
                                                  <span className="truncate rounded bg-[#18181b] px-1.5 py-0.5 text-[10px] font-semibold text-[#a1a1aa]">
                                                    {task.client_project?.name || "Direct client task"}
                                                  </span>
                                                  {stageDefinition && stageDefinition.textAccent ? (
                                                    <span className={`shrink-0 text-[10px] font-semibold ${stageDefinition.textAccent}`}>{stageDefinition.label}</span>
                                                  ) : null}
                                                </div>
                                                <div className="mt-2 flex items-center justify-between gap-2">
                                                  <div className="flex items-center gap-1.5">
                                                    {task.due_date ? (
                                                      <span className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date)) && task.status !== "complete" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-[#3f3f46] text-[#a1a1aa]"}`}>
                                                        <Clock className="h-3 w-3" />
                                                        {format(new Date(task.due_date), "MMM d")}
                                                      </span>
                                                    ) : null}
                                                    {task.priority ? (
                                                      <span className={`h-1.5 w-1.5 rounded-full ${task.priority === "high" ? "bg-rose-500" : task.priority === "medium" ? "bg-amber-500" : "bg-blue-500"}`} aria-label={`Priority: ${task.priority}`} />
                                                    ) : null}
                                                  </div>
                                                  <span className="max-w-[7rem] truncate text-[10px] font-medium text-[#a1a1aa]">
                                                    {task.assignee?.full_name || "Unassigned"}
                                                  </span>
                                                </div>
                                              </div>
                                            )}
                                          </Draggable>
                                        )
                                      })}
                                      {provided.placeholder}
                                      {column?.loading ? (
                                        <div className="flex items-center justify-center gap-2 py-4 text-xs text-[#a1a1aa]" aria-live="polite">
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                                        </div>
                                      ) : null}
                                      {!column?.loading && column && column.tasks.length === 0 && column.page >= column.totalPages ? (
                                        <p className="py-6 text-center text-[10px] text-[#71717a]">No tasks here</p>
                                      ) : null}
                                      {column && !column.loading && column.page < column.totalPages ? (
                                        <button
                                          type="button"
                                          onClick={() => void handleLoadMoreBoardColumn(stage.id)}
                                          className="w-full rounded-lg border border-dashed border-[#3f3f46] py-2 text-xs font-semibold text-[#a1a1aa] transition-colors hover:border-[#0075de]/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0075de]"
                                        >
                                          Load more{total > column.tasks.length ? ` (${total - column.tasks.length} remaining)` : ""}
                                        </button>
                                      ) : null}
                                    </div>
                                  )}
                                </Droppable>
                              </div>
                            )
                          })}
                        </div>
                      </DragDropContext>
                    ) : clientTasksLoading && !clientTaskData ? (
                      <div className="flex min-h-40 items-center justify-center gap-2 px-4 py-10 text-sm text-[#a1a1aa]" aria-live="polite">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading client tasks…
                      </div>
                    ) : clientTasksError ? (
                      <p role="alert" className="m-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{clientTasksError}</p>
                    ) : clientTaskData?.tasks?.length ? (
                      <div className={clientTasksLoading ? "opacity-60" : ""} aria-busy={clientTasksLoading}>
                        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_8rem] gap-4 border-b border-[#27272a] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#71717a] md:grid">
                          <span>Task</span><span>Assignee</span><span>Project</span><span>Status</span>
                        </div>
                        <div className="divide-y divide-[#27272a]">
                          {clientTaskData.tasks.map((task: any) => {
                            const stage = TASK_WORKFLOW_STAGES.find((entry) => entry.id === task.status)
                            return (
                              <button
                                key={task.id}
                                type="button"
                                onClick={() => setSelectedTask(task)}
                                className="grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-[#202023] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0075de] md:grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_8rem] md:items-center md:gap-4"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-white">{task.title}</span>
                                  {task.parent_task_id ? <span className="mt-0.5 block text-[10px] text-[#71717a]">Subtask</span> : null}
                                </span>
                                <span className="truncate text-xs text-[#d4d4d8]">
                                  {task.assignee?.full_name || "Unassigned"}
                                </span>
                                <span className="truncate text-xs text-[#a1a1aa]">
                                  {task.client_project?.name || "Direct client task"}
                                </span>
                                <span className="text-xs font-medium text-[#d4d4d8]">
                                  {stage?.label || task.status.replace(/_/g, " ")}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        {clientTaskData.totalPages > 1 ? (
                          <div className="flex items-center justify-between border-t border-[#27272a] px-4 py-3">
                            <button type="button" onClick={() => setClientTaskPage((page) => Math.max(1, page - 1))} disabled={clientTaskData.page <= 1 || clientTasksLoading} className="rounded-md border border-[#3f3f46] px-3 py-1.5 text-xs text-white disabled:opacity-40">Previous</button>
                            <span className="text-xs text-[#71717a]">Page {clientTaskData.page} of {clientTaskData.totalPages}</span>
                            <button type="button" onClick={() => setClientTaskPage((page) => Math.min(clientTaskData.totalPages, page + 1))} disabled={clientTaskData.page >= clientTaskData.totalPages || clientTasksLoading} className="rounded-md border border-[#3f3f46] px-3 py-1.5 text-xs text-white disabled:opacity-40">Next</button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="px-6 py-12 text-center">
                        <h3 className="text-sm font-semibold text-white">No {clientTaskScope} tasks</h3>
                        <p className="mt-1 text-xs text-[#71717a]">
                          {clientTaskSearch ? "Try a different task title." : `No ${clientTaskScope} task records are linked to this client.`}
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Projects Section */}
                <section>
                  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-white">Projects</h2>
                      <p className="mt-1 text-sm text-[#a1a1aa]">Initiatives and workflows for {activeClient.name}</p>
                    </div>
                    <button 
                      onClick={() => setIsProjectModalOpen(true)} 
                      className="group inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-[#e4e4e7] active:scale-95"
                    >
                      <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" /> 
                      New Project
                    </button>
                  </div>
                  
                  {activeClient.projects.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {activeClient.projects.map((project: any) => {
                        const complete = countCompletedTasks(project.tasks)
                        const progress = project.tasks.length ? Math.round((complete / project.tasks.length) * 100) : 0
                        return (
                          <div 
                            key={project.id} 
                            onClick={() => window.location.href = `/projects/${project.id}/${project.default_view || "board"}`}
                            className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#27272a] bg-[#18181b] p-5 transition-all hover:-translate-y-1 hover:border-[#3f3f46] hover:bg-[#202023] hover:shadow-2xl hover:shadow-black/50"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110" style={{ backgroundColor: `${project.color || '#60a5fa'}20`, color: project.color || '#60a5fa' }}>
                                <FolderKanban className="h-5 w-5" />
                              </div>
                              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => setEditingProject(project)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#27272a] text-[#a1a1aa] transition-colors hover:bg-[#3f3f46] hover:text-white" title="Edit Project"><PencilLine className="h-4 w-4" /></button>
                                <button onClick={() => setDeletingProject(project)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#27272a] text-[#a1a1aa] transition-colors hover:bg-rose-500/20 hover:text-rose-400" title="Delete Project"><Trash2 className="h-4 w-4" /></button>
                              </div>
                            </div>
                            
                            <div className="mt-4 flex-1">
                              <h3 className="truncate text-base font-semibold text-white">{project.name}</h3>
                              <p className="mt-1 text-xs capitalize text-[#71717a]">{project.status.replace(/_/g, " ")}</p>
                            </div>

                            <div className="mt-6 flex items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex justify-between text-[10px] font-medium text-[#a1a1aa]">
                                  <span>Progress</span>
                                  <span>{progress}%</span>
                                </div>
                                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#27272a]">
                                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: project.color || '#60a5fa' }} />
                                </div>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] font-medium text-[#71717a]">Tasks</span>
                                <span className="text-sm font-semibold text-white">{project.tasks.length}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#27272a] bg-[#18181b]/50 px-6 py-16 text-center">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#27272a]">
                        <FolderKanban className="h-6 w-6 text-[#71717a]" />
                      </div>
                      <h3 className="text-sm font-semibold text-white">No projects found</h3>
                      <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#a1a1aa]">Projects are where your team collaborates on tasks. Create one to get started.</p>
                      <button onClick={() => setIsProjectModalOpen(true)} className="mt-6 rounded-full bg-white px-5 py-2 text-xs font-semibold text-black transition-transform hover:scale-105 active:scale-95">Create first project</button>
                    </div>
                  )}
                </section>

              </div>
            </div>
          </div>
        )}
      </div>

      <CreateClientModal isOpen={isClientModalOpen} onClose={() => setIsClientModalOpen(false)} onSuccess={handleClientSaved} />
      <CreateClientModal isOpen={Boolean(editingClient)} onClose={() => setEditingClient(null)} client={editingClient} onSuccess={handleClientSaved} />
      <CreateProjectModal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} clients={clients.filter((client) => !client.archived)} initialClientId={activeClient?.id} onSuccess={handleProjectCreated} />
      <EditProjectModal project={editingProject} onCancel={() => setEditingProject(null)} onSaved={handleProjectUpdated} />
      <DeleteProjectModal project={deletingProject} isDeleting={savingProjectId === deletingProject?.id} onCancel={() => setDeletingProject(null)} onConfirm={handleDeleteProject} />
      <TaskDrawer task={selectedTask} isOpen={Boolean(selectedTask)} onClose={() => setSelectedTask(null)} onTaskUpdated={applyTaskUpdate} />
      <ArchiveClientModal client={archiveTarget} isSaving={savingClientId === archiveTarget?.id} onCancel={() => setArchiveTarget(null)} onConfirm={handleArchive} />
      <DeleteClientModal client={deletingClient} isDeleting={savingClientId === deletingClient?.id} onCancel={() => setDeletingClient(null)} onConfirm={handleDelete} />
      {activeClient ? <AddClientMemberModal isOpen={isMemberModalOpen} onClose={() => setIsMemberModalOpen(false)} clientName={activeClient.name} clientId={activeClient.id} currentMembers={clientMembersMap[activeClient.id] || []} onMembersUpdated={(members) => setClientMembersMap((previous) => ({ ...previous, [activeClient.id]: members }))} /> : null}
    </>
  )
}

function EditProjectModal({ project, onCancel, onSaved }: { project: any | null; onCancel: () => void; onSaved: (project: any) => void }) {
  const projectId = project?.id as string | undefined
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [deadline, setDeadline] = useState("")
  const [defaultView, setDefaultView] = useState("list")
  const [color, setColor] = useState("#6366f1")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<"settings" | "members">("settings")
  const [memberManagement, setMemberManagement] = useState<ProjectMemberManagementData | null>(null)
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState("")

  useEffect(() => {
    setActiveTab("settings")
    setMemberManagement(null)
    setMembersLoading(false)
    setMembersError("")
    if (!project) return
    setName(project.name || "")
    setDescription(project.description || "")
    setDeadline(project.deadline ? format(new Date(project.deadline), "yyyy-MM-dd") : "")
    setDefaultView(project.default_view || "list")
    setColor(project.color || "#6366f1")
    setError("")
  }, [project])

  useEffect(() => {
    if (!projectId || activeTab !== "members") return

    let cancelled = false
    setMembersLoading(true)
    setMembersError("")

    void getProjectMemberManagement(projectId)
      .then((data) => {
        if (!cancelled) setMemberManagement(data)
      })
      .catch(() => {
        if (!cancelled) setMembersError("The project members could not be loaded")
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeTab, projectId])

  if (!project) return null

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError("")
    const result = await updateProject(project.id, {
      name: name.trim(),
      description: description.trim(),
      deadline: deadline || null,
      default_view: defaultView,
      color,
    })
    setSaving(false)
    if (!result.success || !result.project) {
      setError(result.error || "The project could not be updated")
      return
    }
    onSaved(result.project)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(event) => event.target === event.currentTarget && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="edit-project-title" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#3f3f46] bg-[#202023]">
        <div className="flex items-center justify-between gap-3 border-b border-[#3f3f46] px-6 py-4">
          <h3 id="edit-project-title" className="text-lg font-semibold text-white">Edit project</h3>
          <button type="button" onClick={onCancel} className="text-xs text-[#a1a1aa] hover:text-white">Close</button>
        </div>

        <div role="tablist" aria-label="Edit project sections" className="flex gap-1 border-b border-[#3f3f46] px-6 pt-2">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
            className={`border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${activeTab === "settings" ? "border-[#0075de] text-white" : "border-transparent text-[#a1a1aa] hover:text-white"}`}
          >
            Project settings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "members"}
            onClick={() => setActiveTab("members")}
            className={`border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${activeTab === "members" ? "border-[#0075de] text-white" : "border-transparent text-[#a1a1aa] hover:text-white"}`}
          >
            Members
          </button>
        </div>

        {activeTab === "settings" ? (
          <form onSubmit={handleSubmit} className="min-h-0 overflow-y-auto p-6">
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-[#a1a1aa]">Project name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={500} className="mt-1.5 h-10 w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-3 text-sm text-white outline-none focus:border-[#0075de]" /></label>
              <label className="block text-xs font-semibold text-[#a1a1aa]">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-md border border-[#3f3f46] bg-[#18181b] px-3 py-2 text-sm text-white outline-none focus:border-[#0075de]" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-[#a1a1aa]">Deadline<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-3 text-sm text-white outline-none focus:border-[#0075de]" /></label>
                <label className="block text-xs font-semibold text-[#a1a1aa]">Default view<select value={defaultView} onChange={(event) => setDefaultView(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-3 text-sm text-white outline-none focus:border-[#0075de]"><option value="list">List</option><option value="board">Board</option><option value="calendar">Calendar</option><option value="timeline">Timeline</option></select></label>
              </div>
              <label className="block text-xs font-semibold text-[#a1a1aa]">Color<input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="mt-1.5 h-10 w-full cursor-pointer rounded-md border border-[#3f3f46] bg-[#18181b] p-1" /></label>
            </div>
            {error ? <p className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={saving} className="rounded-md border border-[#3f3f46] px-4 py-2 text-xs text-white disabled:opacity-50">Cancel</button><button type="submit" disabled={saving || !name.trim()} className="rounded-full bg-[#0075de] px-5 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button></div>
          </form>
        ) : (
          <div role="tabpanel" className="min-h-0 overflow-y-auto p-6">
            {membersLoading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[#a1a1aa]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading project members…
              </div>
            ) : membersError ? (
              <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{membersError}</p>
            ) : memberManagement ? (
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
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function DeleteProjectModal({ project, isDeleting, onCancel, onConfirm }: { project: any | null; isDeleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [confirmation, setConfirmation] = useState("")
  useEffect(() => setConfirmation(""), [project?.id])
  if (!project) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(event) => event.target === event.currentTarget && onCancel()}><div className="w-full max-w-md rounded-xl border border-[#3f3f46] bg-[#202023] p-6"><h3 className="text-lg font-semibold text-white">Delete {project.name}?</h3><p className="mt-2 text-xs leading-5 text-[#a1a1aa]">This permanently removes the Project and all {project.tasks?.length || 0} Tasks inside it. Direct Client Tasks are not affected. Type the Project name to confirm.</p><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={project.name} className="mt-4 h-9 w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-3 text-xs text-white outline-none focus:border-rose-500" /><div className="mt-5 flex justify-end gap-2"><button onClick={onCancel} className="rounded-md border border-[#3f3f46] px-4 py-1.5 text-xs text-white">Cancel</button><button onClick={onConfirm} disabled={isDeleting || confirmation !== project.name} className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{isDeleting ? "Deleting…" : "Delete project"}</button></div></div></div>
}

function TaskCard({ task, direct, dragging, converting, onOpen, onConvert }: { task: any; direct: boolean; dragging: boolean; converting: boolean; onOpen: () => void; onConvert: () => void }) {
  return (
    <div className={`rounded-lg border bg-[#18181b] p-3 ${dragging ? "border-[#0075de] shadow-xl" : "border-[#3f3f46]"}`}>
      <button onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-2"><span className={`text-xs font-semibold leading-5 ${task.status === "complete" ? "text-[#71717a] line-through" : "text-white"}`}>{task.title}</span><CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${task.status === "complete" ? "text-emerald-400" : "text-[#52525b]"}`} /></div>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[#a1a1aa]">{task.assignee?.full_name ? <span>{task.assignee.full_name}</span> : <span>Unassigned</span>}{task.due_date ? <span className={isTaskOverdue(task) ? "text-rose-400" : ""}><Calendar className="mr-1 inline h-3 w-3" />{format(new Date(task.due_date), "MMM d")}</span> : null}{task.quality_required ? <span className="text-amber-300">Quality controlled</span> : null}</div>
      </button>
      {direct ? <div className="mt-2 border-t border-[#27272a] pt-2 text-right"><button onClick={onConvert} disabled={converting} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#60a5fa] disabled:opacity-50"><ArrowUpCircle className="h-3 w-3" />{converting ? "Converting…" : "Convert to Project"}</button></div> : null}
    </div>
  )
}

function ArchiveClientModal({ client, isSaving, onCancel, onConfirm }: { client: any | null; isSaving: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (!client) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(event) => event.target === event.currentTarget && onCancel()}><div className="w-full max-w-md rounded-xl border border-[#3f3f46] bg-[#202023] p-6"><h3 className="text-lg font-semibold text-white">{client.archived ? "Restore" : "Archive"} {client.name}?</h3><p className="mt-2 text-xs leading-5 text-[#a1a1aa]">Projects, tasks, and history remain intact.</p><div className="mt-5 flex justify-end gap-2"><button onClick={onCancel} className="rounded-md border border-[#3f3f46] px-4 py-1.5 text-xs text-white">Cancel</button><button onClick={onConfirm} disabled={isSaving} className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{isSaving ? "Saving…" : client.archived ? "Restore" : "Archive"}</button></div></div></div>
}

function DeleteClientModal({ client, isDeleting, onCancel, onConfirm }: { client: any | null; isDeleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [confirmation, setConfirmation] = useState("")
  useEffect(() => setConfirmation(""), [client?.id])
  if (!client) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(event) => event.target === event.currentTarget && onCancel()}><div className="w-full max-w-md rounded-xl border border-[#3f3f46] bg-[#202023] p-6"><h3 className="text-lg font-semibold text-white">Delete {client.name}?</h3><p className="mt-2 text-xs leading-5 text-[#a1a1aa]">This permanently removes the client and its nested projects and tasks. Type the client name to confirm.</p><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={client.name} className="mt-4 h-9 w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-3 text-xs text-white outline-none focus:border-rose-500" /><div className="mt-5 flex justify-end gap-2"><button onClick={onCancel} className="rounded-md border border-[#3f3f46] px-4 py-1.5 text-xs text-white">Cancel</button><button onClick={onConfirm} disabled={isDeleting || confirmation !== client.name} className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{isDeleting ? "Deleting…" : "Delete"}</button></div></div></div>
}
