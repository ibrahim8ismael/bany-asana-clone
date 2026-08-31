"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { 
  LayoutList, 
  LayoutGrid, 
  Calendar as CalendarIcon, 
  Plus, 
  Filter, 
  ArrowUpDown, 
  ChevronDown, 
  MoreHorizontal,
  Clock,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  Target,
  Settings2,
  ShieldCheck,
  RotateCcw,
  X
} from "lucide-react"
import { 
  DragDropContext, 
  Droppable, 
  Draggable, 
  DropResult 
} from "@hello-pangea/dnd"
import { addDays, addWeeks, format, isFuture, isPast, isSameDay, isToday, startOfWeek, subWeeks } from "date-fns"
import { updateTask, updateTaskPosition, createSection, deleteSection, createTask } from "@/actions/server-actions"
import { syncTaskInSections } from "@/lib/task-sync"
import { TASK_WORKFLOW_STAGES, type TaskWorkflowStageId, validateManualTaskTransition } from "@/lib/workflow"

const TaskDrawer = dynamic(() => import("./task-drawer"), { ssr: false })

type ViewType = "list" | "board"
type GroupByType = "none" | "priority" | "status" | "dueDate" | "custom"
type FilterType = "all" | "today" | "upcoming" | "overdue" | "completed"
type SortType = "recent" | "due_date" | "priority" | "title"

interface MyTasksClientProps {
  initialTasks: any[]
  initialSections: any[]
  initialPendingReviewTasks: any[]
  initialReworkTasks: any[]
  userId: string
  userName: string
  canImport?: boolean
}

export default function MyTasksClient({ initialTasks, initialSections, initialPendingReviewTasks, initialReworkTasks, userId, userName, canImport = false }: MyTasksClientProps) {
  const allInitialTasks = useMemo(() => {
    const map = new Map();
    [...initialTasks, ...initialPendingReviewTasks, ...initialReworkTasks].forEach(t => map.set(t.id, t));
    return Array.from(map.values());
  }, [initialTasks, initialPendingReviewTasks, initialReworkTasks]);

  const [view, setView] = useState<ViewType>("board")
  const [groupBy, setGroupBy] = useState<GroupByType>("status")
  const [tasks, setTasks] = useState(allInitialTasks)
  const [sections, setSections] = useState(initialSections)
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [isAddingSection, setIsAddingSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState("")
  const [filterBy, setFilterBy] = useState<FilterType>("all")
  const [sortBy, setSortBy] = useState<SortType>("recent")
  const [actionError, setActionError] = useState("")
  const searchParams = useSearchParams()

  const syncQueue = (items: any[], updatedTask: any, keep: boolean) => {
    const exists = items.some((item) => item.id === updatedTask.id)
    if (!keep) return items.filter((item) => item.id !== updatedTask.id)
    return exists ? items.map((item) => item.id === updatedTask.id ? updatedTask : item) : [updatedTask, ...items]
  }

  const applyTaskUpdate = (updatedTask: any) => {
    setTasks((previous) => syncQueue(previous, updatedTask, true))
    setSections((prev) => syncTaskInSections(prev, updatedTask, { assigneeId: userId }))
    setSelectedTask((current: any) => current?.id === updatedTask.id ? updatedTask : current)
  }

  useEffect(() => {
    const taskId = searchParams?.get("taskId")
    if (!taskId || selectedTask) return

    const taskFromQuery = tasks.find((task) => task.id === taskId)
    if (taskFromQuery) {
      const timeoutId = window.setTimeout(() => {
        setSelectedTask(taskFromQuery)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [searchParams, selectedTask, tasks])

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      if (filterBy === "completed") return task.status === "complete"
      if (filterBy === "today") return task.due_date ? isToday(new Date(task.due_date)) : false
      if (filterBy === "upcoming") return task.due_date ? isFuture(new Date(task.due_date)) && !isToday(new Date(task.due_date)) : false
      if (filterBy === "overdue") return task.due_date ? isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date)) && task.status !== "complete" : false
      return true
    })

    const sorted = [...filtered]
    sorted.sort((left, right) => {
      if (sortBy === "title") return left.title.localeCompare(right.title)
      if (sortBy === "priority") {
        const order = { high: 0, medium: 1, low: 2, none: 3 }
        const leftPriority = order[(left.priority || "none") as keyof typeof order]
        const rightPriority = order[(right.priority || "none") as keyof typeof order]
        return leftPriority - rightPriority
      }
      if (sortBy === "due_date") {
        const leftDate = left.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER
        const rightDate = right.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER
        return leftDate - rightDate
      }
      return new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime()
    })

    return sorted
  }, [filterBy, sortBy, tasks])

  // Grouping Logic
  const groupedTasks = useMemo(() => {
    const incomplete = visibleTasks.filter(t => t.status !== "complete")
    const completed = visibleTasks.filter(t => t.status === "complete")

    if (groupBy === "priority") {
      return [
        { id: "high", name: "High", color: "text-red-400", tasks: incomplete.filter(t => t.priority === "high") },
        { id: "medium", name: "Medium", color: "text-amber-400", tasks: incomplete.filter(t => t.priority === "medium") },
        { id: "low", name: "Low", color: "text-blue-400", tasks: incomplete.filter(t => t.priority === "low") },
        { id: "none", name: "No Priority", color: "text-zinc-500", tasks: incomplete.filter(t => !t.priority) },
      ]
    }

    if (groupBy === "status") {
      return TASK_WORKFLOW_STAGES.map((stage) => ({
        id: stage.id,
        name: stage.label,
        color: stage.textAccent,
        tasks: stage.id === "complete" ? completed : incomplete.filter((task) => task.status === stage.id),
      }))
    }

    if (groupBy === "dueDate") {
      return [
        { id: "overdue", name: "Overdue", color: "text-red-500", tasks: incomplete.filter(t => t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date))) },
        { id: "today", name: "Today", color: "text-emerald-400", tasks: incomplete.filter(t => t.due_date && isToday(new Date(t.due_date))) },
        { id: "upcoming", name: "Upcoming", color: "text-amber-400", tasks: incomplete.filter(t => t.due_date && isFuture(new Date(t.due_date)) && !isToday(new Date(t.due_date))) },
        { id: "no_date", name: "No Date", color: "text-zinc-500", tasks: incomplete.filter(t => !t.due_date) },
      ]
    }

    if (groupBy === "custom") {
      return sections.map(s => ({
        id: s.id,
        name: s.name,
        color: "text-white/80",
        tasks: (s.tasks || []).filter((task: any) => visibleTasks.some((visibleTask) => visibleTask.id === task.id))
      }))
    }

    // Default: Asana standard grouping
    const standardGroups = [
      { id: "recently_assigned", name: "Recently assigned", icon: Clock, color: "text-blue-400", tasks: incomplete.slice(0, 5) },
      { id: "today", name: "Due Today", icon: CheckCircle2, color: "text-emerald-400", tasks: incomplete.filter(t => t.due_date && isToday(new Date(t.due_date))) },
      { id: "upcoming", name: "Upcoming", icon: CalendarIcon, color: "text-amber-400", tasks: incomplete.filter(t => t.due_date && isFuture(new Date(t.due_date)) && !isToday(new Date(t.due_date))) },
    ]

    if (completed.length > 0) {
      standardGroups.push({ id: "completed", name: "Completed", icon: CheckCircle2, color: "text-emerald-400", tasks: completed })
    }

    return standardGroups
  }, [visibleTasks, groupBy, sections])


  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    // Optimize UI by updating local state first
    // In My Tasks, drag and drop usually only works in the 'Custom' view or within sections
    // If it's a 'Rule-based' view (like Priority), drag and drop might change the property
    
    if (groupBy === "none") {
      const { droppableId } = destination
      const updates: any = {}
      
      if (droppableId === "today") {
        updates.due_date = new Date()
      } else if (droppableId === "upcoming") {
        updates.due_date = addDays(new Date(), 1)
      } else if (droppableId === "recently_assigned") {
        updates.due_date = null
      }

      const result = await updateTask(draggableId, updates)
      if (result.success && result.task) {
        applyTaskUpdate(result.task)
      }
    } else if (groupBy === "custom") {
      const previousSections = sections
      const sourceIdx = sections.findIndex(s => s.id === source.droppableId)
      const destIdx = sections.findIndex(s => s.id === destination.droppableId)
      if (sourceIdx > -1 && destIdx > -1) {
        const newSections = [...sections]
        const sourceTasks = [...newSections[sourceIdx].tasks]
        const destTasks = source.droppableId === destination.droppableId ? sourceTasks : [...newSections[destIdx].tasks]
        
        const [movedTask] = sourceTasks.splice(source.index, 1)
        const optimisticTask = { ...movedTask, section_id: destination.droppableId }
        destTasks.splice(destination.index, 0, optimisticTask)
        
        newSections[sourceIdx].tasks = sourceTasks
        if (source.droppableId !== destination.droppableId) {
          newSections[destIdx].tasks = destTasks
        }
        setSections(newSections)
        setTasks((prev) => prev.map((task) => task.id === draggableId ? optimisticTask : task))

        const result = await updateTaskPosition(draggableId, destination.droppableId, destination.index, source.droppableId)

        if (result.success && result.task) {
          applyTaskUpdate(result.task)
        } else {
          setSections(previousSections)
          setTasks((prev) => prev.map((task) => (
            task.id === draggableId ? { ...task, section_id: source.droppableId } : task
          )))
        }
      }
    } else if (groupBy === "priority") {
      const newPriority = destination.droppableId === "none" ? null : destination.droppableId
      const result = await updateTask(draggableId, { priority: newPriority as any })
      if (result.success && result.task) applyTaskUpdate(result.task)
    } else if (groupBy === "status") {
      const task = tasks.find((entry) => entry.id === draggableId)
      if (!task) return
      const transitionError = validateManualTaskTransition({
        from: task.status,
        to: destination.droppableId,
        qualityRequired: Boolean(task.quality_required),
        qualityState: task.quality_state || "not_required",
      })
      if (transitionError) return
      const newStatus = destination.droppableId
      const result = await updateTask(draggableId, { status: newStatus as any })
      if (result.success && result.task) applyTaskUpdate(result.task)
    }
  }

  const handleAddSection = async () => {
    if (!newSectionName.trim()) return
    const result = await createSection({ name: newSectionName, user_id: userId, position: sections.length * 1000 })
    if (result.success && result.section) {
      setSections([...sections, { ...result.section, tasks: [] }])
      setNewSectionName("")
      setIsAddingSection(false)
    }
  }

  const handleCreateTask = async ({
    sectionId,
    status,
  }: {
    sectionId?: string
    status?: TaskWorkflowStageId
  } = {}) => {
    setActionError("")
    const result = await createTask({
      title: "New Task",
      assignee_id: userId,
      section_id: sectionId,
      status,
    })
    if (result.success && result.task) {
      applyTaskUpdate(result.task)
      setSelectedTask(result.task)
    } else {
      setActionError(result.error || "The task could not be created")
    }
  }

  const handleDeleteSection = async (id: string) => {
    if (confirm("Delete this section? Tasks will remain in your list.")) {
      await deleteSection(id)
      setSections(prev => prev.filter(s => s.id !== id))
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#18181b]">
      {/* Header */}
      <div className="shrink-0 border-b border-[#3f3f46] bg-[#202023] px-4 pb-4 pt-4 sm:px-8 sm:pt-6">
        <div className="mb-4 flex flex-col gap-4 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0075de] text-sm font-semibold text-white shadow-sm sm:h-11 sm:w-11">
              {userName[0]}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-[#f4f4f5] sm:text-2xl">My tasks</h1>
              <p className="text-xs text-[#a1a1aa] font-medium">Focus on what's important today</p>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar sm:justify-end">
            <a
              href="/api/export/my-tasks"
              className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-[#3f3f46] bg-[#18181b] px-3 text-xs font-semibold text-[#f4f4f5] transition-all hover:bg-[#27272a]"
            >
              Export CSV
            </a>
            {canImport ? (
              <Link
                href="/import?targetType=personal"
                className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-[#3f3f46] bg-[#18181b] px-3 text-xs font-semibold text-[#f4f4f5] transition-all hover:bg-[#27272a]"
              >
                Import CSV
              </Link>
            ) : null}
            <button 
              onClick={() => handleCreateTask()}
              className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-[#0075de] px-4 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#005bab]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add task
            </button>
            <div className="relative hidden md:block md:shrink-0 group">
               <button 
                 className="flex items-center gap-2 px-3 py-1.5 bg-[#18181b] hover:bg-[#27272a] text-[#f4f4f5] text-xs font-semibold rounded-md border border-[#3f3f46] transition-all"
                 aria-label="Group by"
              >
                <Settings2 className="w-3.5 h-3.5 text-[#a1a1aa]" />
                Group by: <span className="capitalize">{groupBy === "none" ? "Standard" : groupBy}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#a1a1aa]" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-48 bg-[#202023] border border-[#3f3f46] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-1">
                <GroupByItem label="Standard" active={groupBy === "none"} onClick={() => setGroupBy("none")} />
                <GroupByItem label="Priority" active={groupBy === "priority"} onClick={() => setGroupBy("priority")} />
                <GroupByItem label="Due Date" active={groupBy === "dueDate"} onClick={() => setGroupBy("dueDate")} />
                <GroupByItem label="Status" active={groupBy === "status"} onClick={() => setGroupBy("status")} />
                <GroupByItem label="Custom Columns" active={groupBy === "custom"} onClick={() => setGroupBy("custom")} />
              </div>
             </div>
             <label className="relative shrink-0 md:hidden">
               <span className="sr-only">Group tasks by</span>
               <select
                 value={groupBy}
                 onChange={(event) => setGroupBy(event.target.value as GroupByType)}
                 className="h-8 appearance-none rounded-md border border-[#3f3f46] bg-[#18181b] pl-3 pr-8 text-xs font-semibold text-[#f4f4f5] outline-none"
               >
                 <option value="none">Standard</option>
                 <option value="priority">Priority</option>
                 <option value="dueDate">Due date</option>
                 <option value="status">Status</option>
                 <option value="custom">Custom columns</option>
               </select>
               <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a1a1aa]" />
             </label>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar sm:gap-4">
            <TabItem active={view === "list"} onClick={() => setView("list")} icon={LayoutList} label="List" />
            <TabItem active={view === "board"} onClick={() => setView("board")} icon={LayoutGrid} label="Board" />
          </div>
          <div className="flex items-center gap-2 text-[#a1a1aa]">
            <div className="relative hidden md:block group">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#18181b] hover:bg-[#27272a] border border-[#3f3f46] transition-colors text-xs font-semibold text-[#f4f4f5]">
                <Filter className="w-3.5 h-3.5 text-[#a1a1aa]" />
                Filter: {filterBy.replace("_", " ")}
              </button>
              <div className="absolute right-0 top-full mt-1 w-40 bg-[#202023] border border-[#3f3f46] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-1">
                {(["all", "today", "upcoming", "overdue"] as FilterType[]).map((option) => (
                  <GroupByItem key={option} label={option.replace("_", " ")} active={filterBy === option} onClick={() => setFilterBy(option)} />
                ))}
              </div>
            </div>
            <div className="relative hidden md:block group">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#18181b] hover:bg-[#27272a] border border-[#3f3f46] transition-colors text-xs font-semibold text-[#f4f4f5]">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#a1a1aa]" />
                Sort: {sortBy.replace("_", " ")}
              </button>
              <div className="absolute right-0 top-full mt-1 w-40 bg-[#202023] border border-[#3f3f46] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-1">
                {(["recent", "due_date", "priority", "title"] as SortType[]).map((option) => (
                  <GroupByItem key={option} label={option.replace("_", " ")} active={sortBy === option} onClick={() => setSortBy(option)} />
                ))}
              </div>
            </div>
            <label className="relative min-w-0 flex-1 md:hidden">
              <span className="sr-only">Filter tasks</span>
              <select
                value={filterBy}
                onChange={(event) => setFilterBy(event.target.value as FilterType)}
                className="h-8 w-full appearance-none rounded-md border border-[#3f3f46] bg-[#18181b] pl-3 pr-8 text-xs font-semibold capitalize text-[#f4f4f5] outline-none"
              >
                <option value="all">All tasks</option>
                <option value="today">Today</option>
                <option value="upcoming">Upcoming</option>
                <option value="overdue">Overdue</option>
              </select>
              <Filter className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a1a1aa]" />
            </label>
            <label className="relative min-w-0 flex-1 md:hidden">
              <span className="sr-only">Sort tasks</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortType)}
                className="h-8 w-full appearance-none rounded-md border border-[#3f3f46] bg-[#18181b] pl-3 pr-8 text-xs font-semibold capitalize text-[#f4f4f5] outline-none"
              >
                <option value="recent">Recent</option>
                <option value="due_date">Due date</option>
                <option value="priority">Priority</option>
                <option value="title">Title</option>
              </select>
              <ArrowUpDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a1a1aa]" />
            </label>
          </div>
        </div>
      </div>

      {actionError ? (
        <p role="alert" className="mx-4 mt-4 shrink-0 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 sm:mx-6">
          {actionError}
        </p>
      ) : null}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#18181b]">
        {view === "list" && (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="h-full min-h-0 space-y-6 overflow-y-auto p-4 custom-scrollbar sm:space-y-8 sm:p-6">
              {groupedTasks.map((section) => (
                <ListSection 
                  key={section.id} 
                  section={section} 
                  onTaskClick={setSelectedTask} 
                  onDeleteSection={() => groupBy === "custom" && handleDeleteSection(section.id)}
                  lockQualityStatus={groupBy === "status"}
                />
              ))}
              {groupBy === "custom" && (
                <AddSectionButton 
                  isAdding={isAddingSection} 
                  name={newSectionName} 
                  setName={setNewSectionName} 
                  onAdd={handleAddSection} 
                  onStart={() => setIsAddingSection(true)} 
                  onCancel={() => setIsAddingSection(false)}
                />
              )}
            </div>
          </DragDropContext>
        )}

        {view === "board" && (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="h-full min-h-0 overflow-auto custom-scrollbar">
              <div className="flex min-w-max items-start gap-4 p-4 sm:gap-6 sm:p-6">
                {groupedTasks.map((section) => {
                  const workflowStage = groupBy === "status"
                    ? TASK_WORKFLOW_STAGES.find((stage) => stage.id === section.id)
                    : null
                  return (
                    <BoardColumn
                      key={section.id}
                      section={section}
                      onTaskClick={setSelectedTask}
                      onAddTask={() => handleCreateTask({
                        sectionId: groupBy === "custom" ? section.id : undefined,
                        status: workflowStage?.id,
                      })}
                      canAddTask={!workflowStage || workflowStage.manualTransition}
                      addTaskLabel={`Add task to ${section.name}`}
                    />
                  )
                })}
                {groupBy === "custom" && (
                  <div className="w-[300px] shrink-0">
                    <AddSectionButton 
                      isAdding={isAddingSection} 
                      name={newSectionName} 
                      setName={setNewSectionName} 
                      onAdd={handleAddSection} 
                      onStart={() => setIsAddingSection(true)} 
                      onCancel={() => setIsAddingSection(false)}
                    />
                  </div>
                )}
              </div>
            </div>
          </DragDropContext>
        )}
      </div>

      {/* Task Drawer */}
      <TaskDrawer 
        key={selectedTask?.id || "empty-task"}
        task={selectedTask} 
        isOpen={!!selectedTask} 
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={applyTaskUpdate}
      />
    </div>
  )
}

// Subcomponents

function GroupByItem({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick} 
      className={`min-h-9 w-full rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-[#27272a] ${active ? "bg-[#0075de]/20 font-bold text-[#60a5fa]" : "text-[#f4f4f5]"}`}
    >
      {label}
    </button>
  )
}

function TabItem({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      type="button"
      className={`group flex h-9 shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-2 transition-all ${active ? "border-[#0075de] text-[#0075de] font-semibold" : "border-transparent text-[#a1a1aa] hover:border-[#71717a] hover:text-[#f4f4f5]"}`}
      onClick={onClick}
    >
      <Icon className={`w-3.5 h-3.5 ${active ? "text-[#0075de]" : "text-[#a1a1aa] group-hover:text-[#f4f4f5]"}`} />
      <span className="text-xs">{label}</span>
    </button>
  )
}

function ListSection({ section, onTaskClick, onDeleteSection }: any) {
  return (
    <div className="space-y-3 group/section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {section.icon && <section.icon className={`w-4 h-4 ${section.color}`} />}
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#f4f4f5]">{section.name}</h3>
          <span className="text-[10px] font-bold text-[#a1a1aa] bg-[#27272a] px-1.5 py-0.5 rounded-full">{section.tasks.length}</span>
        </div>
        {onDeleteSection && (
          <button onClick={onDeleteSection} aria-label="Delete section" className="opacity-0 group-hover/section:opacity-100 p-1 hover:bg-[#27272a] rounded text-[#a1a1aa] transition-all">
             <MoreHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>
      
      <Droppable droppableId={section.id}>
        {(provided, snapshot) => (
          <div 
            ref={provided.innerRef} 
            {...provided.droppableProps}
            className={`space-y-1.5 transition-colors min-h-[4px] rounded-xl ${snapshot.isDraggingOver ? "bg-[#202023]" : ""}`}
          >
            {section.tasks.map((task: any, index: number) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div 
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`group flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-[#3f3f46] bg-[#202023] px-3 py-2 transition-all hover:border-[#0075de]/50 hover:shadow-sm sm:gap-4 sm:px-4 ${snapshot.isDragging ? "z-50 border-[#0075de]/50 bg-[#27272a] shadow-xl" : ""}`}
                    onClick={() => onTaskClick(task)}
                  >
                    <CheckCircle2 className={`w-4 h-4 shrink-0 ${task.status === "complete" ? "text-emerald-400 fill-emerald-950" : "text-[#71717a] hover:text-[#0075de]"}`} />
                    <span className={`text-xs flex-1 truncate font-medium ${task.status === "complete" ? "text-[#71717a] line-through" : "text-[#f4f4f5]"}`}>{task.title}</span>
                    {task.priority && (
                       <span className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${
                          task.priority === "high" ? "bg-red-500/20 text-red-300 border border-red-500/30" :
                          task.priority === "medium" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                          "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                       }`}>
                         {task.priority}
                       </span>
                    )}
                    {task.project && (
                      <span className="hidden shrink-0 rounded bg-[#18181b] px-2 py-0.5 text-[10px] font-semibold text-[#a1a1aa] sm:inline">
                        {task.project.name}
                      </span>
                    )}
                    <MoreHorizontal className="w-4 h-4 shrink-0 text-transparent group-hover:text-[#a1a1aa] transition-all" />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}

function BoardColumn({ section, onTaskClick, onAddTask, canAddTask = true, addTaskLabel }: any) {
  return (
    <div className="flex min-h-[360px] w-[calc(100vw-3rem)] shrink-0 flex-col rounded-xl border border-[#3f3f46] bg-[#202023] sm:w-[300px]">
      <div className="p-3 border-b border-[#3f3f46] flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
           <h3 className="text-xs font-bold uppercase tracking-wider text-[#f4f4f5]">{section.name}</h3>
           <span className="text-[10px] font-bold text-[#a1a1aa] bg-[#18181b] px-1.5 py-0.5 rounded-full">{section.tasks.length}</span>
        </div>
        <div className="flex items-center gap-1">
          {canAddTask ? (
            <button
              type="button"
              onClick={onAddTask}
              aria-label={addTaskLabel}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#3f3f46] text-[#a1a1aa] transition-colors hover:border-[#0075de]/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0075de]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span
              aria-label={`${section.name} is controlled by the quality workflow`}
              title={`${section.name} is controlled by the quality workflow`}
              className="inline-flex h-7 w-7 items-center justify-center text-[#71717a]"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
            </span>
          )}
          <button aria-label="More options" className="p-1 hover:bg-[#27272a] rounded text-[#a1a1aa]"><MoreHorizontal className="w-4 h-4" /></button>
        </div>
      </div>
      
      <Droppable droppableId={section.id}>
        {(provided, snapshot) => (
          <div 
            ref={provided.innerRef} 
            {...provided.droppableProps}
            className={`flex-1 space-y-2.5 p-3 transition-colors ${snapshot.isDraggingOver ? "bg-[#18181b]/60" : ""}`}
          >
            {section.tasks.map((task: any, index: number) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    onClick={() => onTaskClick(task)}
                    className={`bg-[#202023] border border-[#3f3f46] rounded-lg p-3 shadow-sm hover:border-[#0075de]/50 hover:shadow-md transition-all ${snapshot.isDragging ? "shadow-xl border-[#0075de]/50 rotate-1 bg-[#27272a]" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                       <h4 className={`text-xs font-semibold ${task.status === "complete" ? "text-[#71717a] line-through" : "text-[#f4f4f5]"}`}>{task.title}</h4>
                       <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${task.status === "complete" ? "text-emerald-400" : "text-[#71717a]"}`} />
                    </div>
                    {task.project && (
                       <div className="flex items-center gap-1.5 mb-2.5">
                         <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: task.project.color || "#0075de" }} />
                         <span className="text-[10px] font-medium text-[#a1a1aa]">{task.project.name}</span>
                       </div>
                    )}
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                         {task.due_date && (
                            <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date)) ? "text-rose-400 bg-rose-500/10 border-rose-500/30" : "text-[#a1a1aa] border-[#3f3f46]"}`}>
                               <Clock className="w-3 h-3" />
                               {format(new Date(task.due_date), "MMM d")}
                            </div>
                         )}
                         {task.priority && (
                            <div className={`w-1.5 h-1.5 rounded-full ${task.priority === "high" ? "bg-rose-500" : task.priority === "medium" ? "bg-amber-500" : "bg-blue-500"}`} />
                         )}
                       </div>
                       {task.assignee && (
                          <img src={task.assignee.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(task.assignee.full_name)}&background=0075de&color=fff&size=20`} alt={task.assignee.full_name} className="w-4 h-4 rounded-full border border-[#3f3f46] ring-1 ring-[#27272a]" />
                       )}
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {canAddTask ? (
              <button
                type="button"
                onClick={onAddTask}
                aria-label={addTaskLabel}
                className="w-full py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#a1a1aa] hover:text-[#f4f4f5] border border-dashed border-[#3f3f46] hover:border-[#0075de]/50 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0075de]"
              >
                <Plus className="w-3.5 h-3.5 text-[#0075de]" />
                Add task
              </button>
            ) : null}
          </div>
        )}
      </Droppable>
    </div>
  )
}

function AddSectionButton({ isAdding, name, setName, onAdd, onStart, onCancel }: any) {
  if (isAdding) {
    return (
      <div className="bg-[#202023] border border-[#3f3f46] rounded-xl p-3 shadow-md">
        <input 
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd()
            if (e.key === "Escape") onCancel()
          }}
          placeholder="Section name..."
          className="w-full bg-[#18181b] border border-[#3f3f46] rounded px-2.5 py-1.5 text-xs text-[#f4f4f5] outline-none focus:border-[#0075de] mb-2.5"
        />
        <div className="flex items-center gap-2">
           <button onClick={onAdd} className="px-3 py-1 bg-[#0075de] text-white text-xs font-semibold rounded-full hover:bg-[#005bab]">Add Section</button>
           <button onClick={onCancel} className="px-3 py-1 bg-[#18181b] text-[#a1a1aa] text-xs font-medium rounded-md hover:bg-[#27272a]">Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <button 
      onClick={onStart}
      className="w-full py-3 flex items-center justify-center gap-2 border border-dashed border-[#3f3f46] hover:border-[#0075de]/50 rounded-xl text-xs font-semibold text-[#a1a1aa] hover:text-[#f4f4f5] transition-all group bg-[#202023]"
    >
      <Plus className="w-4 h-4 text-[#0075de]" />
      Create Custom Column
    </button>
  )
}
