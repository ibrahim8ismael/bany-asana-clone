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

const TaskDrawer = dynamic(() => import("./task-drawer"), { ssr: false })

type ViewType = "list" | "board" | "calendar"
type GroupByType = "none" | "priority" | "status" | "dueDate" | "custom"
type FilterType = "all" | "today" | "upcoming" | "overdue" | "completed"
type SortType = "recent" | "due_date" | "priority" | "title"
type WorkTab = "work" | "reviews" | "rework" | "completed"

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
  const [view, setView] = useState<ViewType>("list")
  const [groupBy, setGroupBy] = useState<GroupByType>("none")
  const [tasks, setTasks] = useState(initialTasks)
  const [pendingReviewTasks, setPendingReviewTasks] = useState(initialPendingReviewTasks)
  const [reworkTasks, setReworkTasks] = useState(initialReworkTasks)
  const [activeTab, setActiveTab] = useState<WorkTab>(initialPendingReviewTasks.length > 0 ? "reviews" : "work")
  const [sections, setSections] = useState(initialSections)
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [isAddingSection, setIsAddingSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState("")
  const [filterBy, setFilterBy] = useState<FilterType>("all")
  const [sortBy, setSortBy] = useState<SortType>("recent")
  const [calendarAnchor, setCalendarAnchor] = useState(new Date())
  const searchParams = useSearchParams()

  const syncQueue = (items: any[], updatedTask: any, keep: boolean) => {
    const exists = items.some((item) => item.id === updatedTask.id)
    if (!keep) return items.filter((item) => item.id !== updatedTask.id)
    return exists ? items.map((item) => item.id === updatedTask.id ? updatedTask : item) : [updatedTask, ...items]
  }

  const applyTaskUpdate = (updatedTask: any) => {
    const ownedTask = updatedTask.assignee_id === userId
      || (!updatedTask.assignee_id && updatedTask.creator_id === userId && !updatedTask.project_id && !updatedTask.client_id)
    setTasks((previous) => syncQueue(previous, updatedTask, ownedTask))
    setSections((prev) => syncTaskInSections(prev, updatedTask, { assigneeId: userId }))
    setPendingReviewTasks((previous) => syncQueue(previous, updatedTask, updatedTask.reviewer_id === userId && updatedTask.quality_state === "submitted"))
    setReworkTasks((previous) => syncQueue(previous, updatedTask, ownedTask && updatedTask.quality_state === "needs_rework"))
    setSelectedTask((current: any) => current?.id === updatedTask.id ? updatedTask : current)
  }

  useEffect(() => {
    const taskId = searchParams?.get("taskId")
    if (!taskId || selectedTask) return

    const taskFromReview = pendingReviewTasks.find((task) => task.id === taskId)
    const taskFromRework = reworkTasks.find((task) => task.id === taskId)
    const taskFromQuery = taskFromReview || taskFromRework || tasks.find((task) => task.id === taskId)
    if (taskFromQuery) {
      const timeoutId = window.setTimeout(() => {
        if (taskFromReview) setActiveTab("reviews")
        else if (taskFromRework) setActiveTab("rework")
        setSelectedTask(taskFromQuery)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [pendingReviewTasks, reworkTasks, searchParams, selectedTask, tasks])

  const visibleTasks = useMemo(() => {
    const tabTasks = activeTab === "completed"
      ? tasks.filter((task) => task.status === "complete")
      : tasks.filter((task) => task.status !== "complete" && task.quality_state !== "needs_rework")
    const filtered = tabTasks.filter((task) => {
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
  }, [activeTab, filterBy, sortBy, tasks])

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
      return [
        { id: "incomplete", name: "To Do", color: "text-zinc-400", tasks: incomplete.filter(t => t.status === "incomplete") },
        { id: "in_progress", name: "In Progress", color: "text-blue-400", tasks: incomplete.filter(t => t.status === "in_progress") },
        { id: "submitted_for_review", name: "In Review", color: "text-amber-400", tasks: incomplete.filter(t => t.status === "submitted_for_review") },
        { id: "needs_rework", name: "Needs Rework", color: "text-rose-400", tasks: incomplete.filter(t => t.status === "needs_rework") },
        { id: "complete", name: "Completed", color: "text-emerald-400", tasks: completed },
      ]
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

  const calendarDays = useMemo(() => {
    const start = startOfWeek(calendarAnchor, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, index) => addDays(start, index))
  }, [calendarAnchor])

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    // Optimize UI by updating local state first
    // In My Tasks, drag and drop usually only works in the 'Custom' view or within sections
    // If it's a 'Rule-based' view (like Priority), drag and drop might change the property
    
    if (groupBy === "none") {
      const { droppableId } = destination
      let updates: any = {}
      
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
      if (task?.quality_required || ["submitted_for_review", "needs_rework"].includes(destination.droppableId)) return
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

  const handleCreateTask = async (sectionId?: string) => {
    const result = await createTask({
      title: "New Task",
      assignee_id: userId,
      section_id: sectionId
    })
    if (result.success && result.task) {
      applyTaskUpdate(result.task)
      setSelectedTask(result.task)
    }
  }

  const handleDeleteSection = async (id: string) => {
    if (confirm("Delete this section? Tasks will remain in your list.")) {
      await deleteSection(id)
      setSections(prev => prev.filter(s => s.id !== id))
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#1e1f21]">
      {/* Header */}
      <div className="shrink-0 border-b border-white/5 px-4 pb-0 pt-4 sm:px-8 sm:pt-8">
        <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20 sm:h-12 sm:w-12 sm:text-xl">
              {userName[0]}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-white/90 sm:text-2xl">My tasks</h1>
              <p className="text-sm text-white/40 font-medium">Focus on what's important today</p>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar sm:justify-end">
            <a
              href="/api/export/my-tasks"
              className="flex h-11 shrink-0 items-center gap-2 rounded-md border border-white/5 bg-white/5 px-3 text-xs font-semibold text-white/70 transition-all hover:bg-white/10 sm:h-9"
            >
              Export CSV
            </a>
            {canImport ? (
              <Link
                href="/import?targetType=personal"
                className="flex h-11 shrink-0 items-center gap-2 rounded-md border border-white/5 bg-white/5 px-3 text-xs font-semibold text-white/70 transition-all hover:bg-white/10 sm:h-9"
              >
                Import CSV
              </Link>
            ) : null}
            {activeTab === "work" ? (
              <button 
                onClick={() => handleCreateTask()}
                className="flex h-11 shrink-0 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 sm:h-9"
              >
                <Plus className="w-3.5 h-3.5" />
                Add task
              </button>
            ) : null}
             {activeTab === "work" ? <div className="relative hidden md:block md:shrink-0 group">
               <button 
                 className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold rounded-md border border-white/5 transition-all"
                 aria-label="Group by"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Group by: <span className="capitalize">{groupBy === "none" ? "Standard" : groupBy}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-48 bg-[#2a2b2d] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <GroupByItem label="Standard" active={groupBy === "none"} onClick={() => setGroupBy("none")} />
                <GroupByItem label="Priority" active={groupBy === "priority"} onClick={() => setGroupBy("priority")} />
                <GroupByItem label="Due Date" active={groupBy === "dueDate"} onClick={() => setGroupBy("dueDate")} />
                <GroupByItem label="Status" active={groupBy === "status"} onClick={() => setGroupBy("status")} />
                <GroupByItem label="Custom Columns" active={groupBy === "custom"} onClick={() => setGroupBy("custom")} />
              </div>
             </div> : null}
             {activeTab === "work" ? (
               <label className="relative shrink-0 md:hidden">
                 <span className="sr-only">Group tasks by</span>
                 <select
                   value={groupBy}
                   onChange={(event) => setGroupBy(event.target.value as GroupByType)}
                   className="h-11 appearance-none rounded-md border border-white/10 bg-[#292a2c] pl-3 pr-8 text-xs font-semibold text-white/75 outline-none"
                 >
                   <option value="none">Standard</option>
                   <option value="priority">Priority</option>
                   <option value="dueDate">Due date</option>
                   <option value="status">Status</option>
                   <option value="custom">Custom columns</option>
                 </select>
                 <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/45" />
               </label>
             ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-b border-white/5 pb-0 custom-scrollbar">
          {([
            { id: "work", label: "My Work", count: tasks.filter((task) => task.status !== "complete" && task.quality_state !== "needs_rework").length, icon: CheckCircle2 },
            { id: "reviews", label: "Reviews", count: pendingReviewTasks.length, icon: ShieldCheck },
            { id: "rework", label: "Rework", count: reworkTasks.length, icon: RotateCcw },
            { id: "completed", label: "Completed", count: tasks.filter((task) => task.status === "complete").length, icon: CheckCircle2 },
          ] as Array<{ id: WorkTab; label: string; count: number; icon: typeof CheckCircle2 }>).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id)
                setFilterBy("all")
              }}
              className={`flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors ${activeTab === tab.id ? "border-blue-400 text-white" : "border-transparent text-white/40 hover:text-white/70"}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.count > 0 ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === tab.id ? "bg-blue-500/20 text-blue-200" : "bg-white/5 text-white/40"}`}>{tab.count}</span> : null}
            </button>
          ))}
        </div>

        {(activeTab === "work" || activeTab === "completed") ? <div className="flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar sm:gap-4">
            <TabItem active={view === "list"} onClick={() => setView("list")} icon={LayoutList} label="List" />
            <TabItem active={view === "board"} onClick={() => setView("board")} icon={LayoutGrid} label="Board" />
            <TabItem active={view === "calendar"} onClick={() => setView("calendar")} icon={CalendarIcon} label="Calendar" />
          </div>
             <div className="mb-3 flex items-center gap-2 text-white/40">
              <div className="relative hidden md:block group">
                <button className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors text-xs font-medium hover:text-white/80">
                  <Filter className="w-3.5 h-3.5" />
                  Filter: {filterBy.replace("_", " ")}
                </button>
                <div className="absolute right-0 top-full mt-1 w-40 bg-[#2a2b2d] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  {(["all", "today", "upcoming", "overdue"] as FilterType[]).map((option) => (
                    <GroupByItem key={option} label={option.replace("_", " ")} active={filterBy === option} onClick={() => setFilterBy(option)} />
                  ))}
                </div>
              </div>
              <div className="relative hidden md:block group">
                <button className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors text-xs font-medium hover:text-white/80">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Sort: {sortBy.replace("_", " ")}
                </button>
                <div className="absolute right-0 top-full mt-1 w-40 bg-[#2a2b2d] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
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
                  className="h-11 w-full appearance-none rounded-md border border-white/10 bg-[#292a2c] pl-3 pr-8 text-xs font-semibold capitalize text-white/75 outline-none"
                >
                  <option value="all">All tasks</option>
                  <option value="today">Today</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="overdue">Overdue</option>
                </select>
                <Filter className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/45" />
              </label>
              <label className="relative min-w-0 flex-1 md:hidden">
                <span className="sr-only">Sort tasks</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortType)}
                  className="h-11 w-full appearance-none rounded-md border border-white/10 bg-[#292a2c] pl-3 pr-8 text-xs font-semibold capitalize text-white/75 outline-none"
                >
                  <option value="recent">Recent</option>
                  <option value="due_date">Due date</option>
                  <option value="priority">Priority</option>
                  <option value="title">Title</option>
                </select>
                <ArrowUpDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/45" />
              </label>
           </div>
        </div> : <div className="h-3" />}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "reviews" ? (
          <QualityQueueList kind="reviews" tasks={pendingReviewTasks} onOpen={setSelectedTask} />
        ) : null}

        {activeTab === "rework" ? (
          <QualityQueueList kind="rework" tasks={reworkTasks} onOpen={setSelectedTask} />
        ) : null}

        {(activeTab === "work" || activeTab === "completed") && view === "list" && (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="h-full min-h-0 space-y-7 overflow-y-auto p-4 custom-scrollbar sm:space-y-10 sm:p-8">
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

        {(activeTab === "work" || activeTab === "completed") && view === "board" && (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="h-full min-h-0 overflow-auto custom-scrollbar">
              <div className="flex min-w-max items-start gap-4 p-4 sm:gap-6 sm:p-8">
                {groupedTasks.map((section) => (
                  <BoardColumn 
                    key={section.id} 
                    section={section} 
                    onTaskClick={setSelectedTask}
                    onAddTask={() => handleCreateTask(groupBy === "custom" ? section.id : undefined)}
                    lockQualityStatus={groupBy === "status"}
                  />
                ))}
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

        {(activeTab === "work" || activeTab === "completed") && view === "calendar" && (
          <div className="h-full min-h-0 space-y-6 overflow-y-auto p-4 custom-scrollbar sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-white/85 font-semibold">Week of {format(calendarDays[0], "MMM d")}</h3>
                <p className="text-sm text-white/40">Tasks grouped by due date for the current week.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setCalendarAnchor((prev) => subWeeks(prev, 1))} className="px-3 py-1.5 rounded-md bg-white/5 text-xs text-white/70 hover:bg-white/10">Prev</button>
                <button onClick={() => setCalendarAnchor(new Date())} className="px-3 py-1.5 rounded-md bg-white/5 text-xs text-white/70 hover:bg-white/10">Today</button>
                <button onClick={() => setCalendarAnchor((prev) => addWeeks(prev, 1))} className="px-3 py-1.5 rounded-md bg-white/5 text-xs text-white/70 hover:bg-white/10">Next</button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {calendarDays.map((day) => {
                const dayTasks = visibleTasks.filter((task) => task.due_date && isSameDay(new Date(task.due_date), day))
                return (
                  <div key={day.toISOString()} className="rounded-2xl border border-white/5 bg-[#262729] p-4 min-h-[220px]">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-white/25">{format(day, "EEE")}</div>
                        <div className="text-lg font-semibold text-white/85">{format(day, "MMM d")}</div>
                      </div>
                      <div className="text-xs text-white/35">{dayTasks.length}</div>
                    </div>

                    <div className="space-y-2">
                      {dayTasks.length === 0 ? (
                        <div className="text-sm text-white/25">No due tasks</div>
                      ) : (
                        dayTasks.map((task) => (
                          <button key={task.id} onClick={() => setSelectedTask(task)} className="w-full rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-left hover:bg-white/10 transition-colors">
                            <div className="text-sm text-white/80 font-medium truncate">{task.title}</div>
                            <div className="text-[11px] text-white/35 mt-1">{task.project?.name || task.client?.name || "Personal task"}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
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

function QualityQueueList({ kind, tasks, onOpen }: { kind: "reviews" | "rework"; tasks: any[]; onOpen: (task: any) => void }) {
  const isReviewQueue = kind === "reviews"

  return (
    <div className="h-full overflow-y-auto p-5 custom-scrollbar sm:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-[0.22em] ${isReviewQueue ? "text-amber-300/70" : "text-rose-300/70"}`}>{isReviewQueue ? "Reviewer queue" : "Correction queue"}</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white/90">{isReviewQueue ? "Waiting for your decision" : "Work returned to you"}</h2>
            <p className="mt-2 text-sm text-white/40">{isReviewQueue ? "Open a delivery, choose one grade, and confirm the decision." : "Resolve every finding, then resubmit to the same reviewer."}</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/55">{tasks.length} actionable</div>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
            {isReviewQueue ? <ShieldCheck className="mx-auto h-8 w-8 text-emerald-400/60" /> : <RotateCcw className="mx-auto h-8 w-8 text-emerald-400/60" />}
            <div className="mt-4 text-sm font-semibold text-white/75">{isReviewQueue ? "No reviews waiting" : "No rework assigned"}</div>
            <p className="mt-1 text-xs text-white/35">This queue updates when a task is submitted or reviewed.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/7 bg-[#242527]">
            {tasks.map((task) => {
              const review = task.quality_reviews?.[0]
              const actionDate = isReviewQueue ? review?.review_due_at : task.rework_due_date
              const overdue = actionDate ? new Date(actionDate) < new Date() : false
              const cycle = review?.cycle_number || task.review_cycle_count || 1

              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpen(task)}
                  className="grid w-full gap-4 border-b border-white/5 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-white/[0.035] sm:grid-cols-[minmax(0,1fr)_150px_120px_auto] sm:items-center sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white/85">{task.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/35">
                      <span>{task.project?.name || task.client?.name || "Personal task"}</span>
                      <span>·</span>
                      <span>{isReviewQueue ? `Submitted by ${task.assignee?.full_name || review?.submitter?.full_name || "task owner"}` : `Reviewer ${task.reviewer?.full_name || "unassigned"}`}</span>
                    </div>
                  </div>
                  <div className="text-xs text-white/45"><span className="font-semibold text-white/70">Cycle {cycle}</span><div className="mt-1">{isReviewQueue ? `Submitted ${review?.submitted_at ? format(new Date(review.submitted_at), "MMM d, h:mm a") : "recently"}` : `${review?.issues?.length || 0} findings`}</div></div>
                  <div className={`text-xs font-semibold ${overdue ? "text-rose-300" : "text-white/50"}`}>{overdue ? "Overdue · " : "Due · "}{actionDate ? format(new Date(actionDate), "MMM d") : "No date"}</div>
                  <span className={`w-fit rounded-lg px-3 py-2 text-xs font-semibold text-white ${isReviewQueue ? "bg-amber-500/80" : "bg-rose-500/80"}`}>{isReviewQueue ? "Review now" : "Open rework"}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function GroupByItem({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick} 
      className={`min-h-11 w-full border-l-2 px-4 py-2.5 text-left text-xs transition-colors hover:bg-white/5 ${active ? "border-blue-500 bg-blue-500/5 font-bold text-blue-400" : "border-transparent text-white/60 hover:text-white/90"}`}
    >
      {label}
    </button>
  )
}

function TabItem({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      type="button"
      className={`group flex h-11 shrink-0 cursor-pointer items-center gap-1 border-b-2 px-2 transition-all ${active ? "border-white/80 text-white/90" : "border-transparent text-white/40 hover:border-white/20 hover:text-white/60"}`}
      onClick={onClick}
    >
      <Icon className={`w-3.5 h-3.5 ${active ? "text-white/90" : "text-white/40 group-hover:text-white/60 font-bold"}`} />
      <span className={`text-sm ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
    </button>
  )
}

function ListSection({ section, onTaskClick, onDeleteSection, lockQualityStatus }: any) {
  const isWorkflowColumn = ["submitted_for_review", "needs_rework"].includes(section.id)
  return (
    <div className="space-y-4 group/section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {section.icon && <section.icon className={`w-4 h-4 ${section.color}`} />}
          <h3 className={`text-sm font-bold uppercase tracking-wider ${section.color}`}>{section.name}</h3>
          <span className="text-xs text-white/20 font-bold bg-white/5 px-1.5 py-0.5 rounded">{section.tasks.length}</span>
        </div>
        {onDeleteSection && (
          <button onClick={onDeleteSection} aria-label="Delete section" className="opacity-0 group-hover/section:opacity-100 p-1 hover:bg-white/5 rounded text-white/40 transition-all">
             <MoreHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>
      
      <Droppable droppableId={section.id} isDropDisabled={isWorkflowColumn}>
        {(provided, snapshot) => (
          <div 
            ref={provided.innerRef} 
            {...provided.droppableProps}
            className={`space-y-1 transition-colors min-h-[4px] rounded-lg ${snapshot.isDraggingOver ? "bg-white/5" : ""}`}
          >
            {section.tasks.map((task: any, index: number) => (
              <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={lockQualityStatus && task.quality_required}>
                {(provided, snapshot) => (
                  <div 
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`group flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/5 bg-[#2a2b2d]/40 px-3 py-2.5 transition-all hover:bg-[#2a2b2d] sm:gap-4 sm:px-4 ${snapshot.isDragging ? "z-50 border-white/20 bg-[#2a2b2d] shadow-xl" : ""}`}
                    onClick={() => onTaskClick(task)}
                  >
                    <CheckCircle2 className={`w-4 h-4 shrink-0 ${task.status === "complete" ? "text-emerald-500 fill-emerald-500/20" : "text-white/20 hover:text-white/40"}`} />
                    <span className={`text-sm flex-1 truncate ${task.status === "complete" ? "text-white/30 line-through" : "text-white/80"}`}>{task.title}</span>
                    {task.priority && (
                       <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                          task.priority === "high" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                          task.priority === "medium" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                          "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                       }`}>
                         {task.priority}
                       </span>
                    )}
                    {task.project && (
                      <span className="hidden shrink-0 rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/40 transition-colors group-hover:text-white/60 sm:inline">
                        {task.project.name}
                      </span>
                    )}
                    <MoreHorizontal className="w-4 h-4 shrink-0 text-white/0 group-hover:text-white/20 transition-all" />
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

function BoardColumn({ section, onTaskClick, onAddTask, lockQualityStatus }: any) {
  const isWorkflowColumn = ["submitted_for_review", "needs_rework"].includes(section.id)
  return (
    <div className="flex min-h-[360px] w-[calc(100vw-3rem)] shrink-0 flex-col rounded-xl bg-[#1e1f21]/40 sm:w-[300px]">
      <div className="p-4 flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
           <h3 className={`text-sm font-bold uppercase tracking-wider text-white/70`}>{section.name}</h3>
           <span className="text-[10px] font-bold text-white/20 bg-white/5 px-1.5 py-0.5 rounded">{section.tasks.length}</span>
        </div>
        <button aria-label="More options" className="p-1 hover:bg-white/5 rounded text-white/40"><MoreHorizontal className="w-4 h-4" /></button>
      </div>
      
      <Droppable droppableId={section.id} isDropDisabled={isWorkflowColumn}>
        {(provided, snapshot) => (
          <div 
            ref={provided.innerRef} 
            {...provided.droppableProps}
            className={`flex-1 space-y-3 px-4 pb-4 transition-colors ${snapshot.isDraggingOver ? "bg-white/5" : ""}`}
          >
            {section.tasks.map((task: any, index: number) => (
              <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={lockQualityStatus && task.quality_required}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    onClick={() => onTaskClick(task)}
                    className={`bg-[#2a2b2d] border border-white/5 rounded-xl p-4 shadow-sm hover:border-white/20 transition-all active:scale-[0.98] ${snapshot.isDragging ? "shadow-2xl border-white/30 rotate-2" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                       <h4 className={`text-sm font-medium ${task.status === "complete" ? "text-white/30 line-through" : "text-white/80"}`}>{task.title}</h4>
                       <CheckCircle2 className={`w-3.5 h-3.5 mt-1 shrink-0 ${task.status === "complete" ? "text-emerald-500" : "text-white/10"}`} />
                    </div>
                    {task.project && (
                       <div className="flex items-center gap-1 mb-3">
                         <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: task.project.color || "#4f46e5" }} />
                         <span className="text-[10px] text-white/40">{task.project.name}</span>
                       </div>
                    )}
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                         {task.due_date && (
                            <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date)) ? "text-red-400 bg-red-400/5 border-red-500/20" : "text-white/30 border-white/5"}`}>
                               <Clock className="w-3 h-3" />
                               {format(new Date(task.due_date), "MMM d")}
                            </div>
                         )}
                         {task.priority && (
                            <div className={`w-1.5 h-1.5 rounded-full ${task.priority === "high" ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" : task.priority === "medium" ? "bg-amber-500" : "bg-blue-500"}`} />
                         )}
                       </div>
                       {task.assignee && (
                          <img src={task.assignee.avatar_url || `https://ui-avatars.com/api/?name=${task.assignee.full_name}&size=20`} alt={task.assignee.full_name} className="w-5 h-5 rounded-full border border-white/10" />
                       )}
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {!isWorkflowColumn ? (
              <button 
                onClick={onAddTask}
                className="w-full py-2 flex items-center justify-center gap-2 text-[10px] font-bold text-white/20 hover:text-white/50 border border-dashed border-white/5 hover:border-white/20 rounded-lg transition-all group"
              >
                <Plus className="w-3 h-3 group-hover:scale-110 transition-transform" />
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
      <div className="bg-[#2a2b2d] border border-blue-500/30 rounded-xl p-4 shadow-xl">
        <input 
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd()
            if (e.key === "Escape") onCancel()
          }}
          placeholder="Section name..."
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500/50 mb-3"
        />
        <div className="flex items-center gap-2">
           <button onClick={onAdd} className="px-3 py-1 bg-blue-600 text-white text-[10px] font-bold rounded">Add Section</button>
           <button onClick={onCancel} className="px-3 py-1 bg-white/5 text-white/60 text-[10px] font-bold rounded">Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <button 
      onClick={onStart}
      className="w-full py-4 flex items-center justify-center gap-3 border-2 border-dashed border-white/5 hover:border-white/10 rounded-2xl text-white/20 hover:text-white/40 transition-all font-bold text-sm group"
    >
      <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
      Create Custom Column
    </button>
  )
}
