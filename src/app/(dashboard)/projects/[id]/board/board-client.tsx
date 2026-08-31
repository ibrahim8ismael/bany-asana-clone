"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { Card } from "@/components/ui/card"
import { MessageSquare, CheckSquare, Plus, X, Calendar, CheckCircle2, ShieldCheck } from "lucide-react"
import { getDueDatePresentation } from "@/lib/due-date"
import { createSection, createTask, updateTask, updateTaskPosition } from "@/actions/server-actions"
import { syncTaskInSections } from "@/lib/task-sync"
import { resolveBoardTaskCreationPlacement } from "@/lib/board-task-placement"
import { nextTaskPosition } from "@/lib/task-placement"
import {
  getTaskWorkflowLabel,
  TASK_WORKFLOW_STAGES,
  validateManualTaskTransition,
  type TaskWorkflowStageId,
} from "@/lib/workflow"

const TaskDrawer = dynamic(() => import("@/components/task-drawer"), { ssr: false })

export default function BoardClient({
  project,
  canManageTasks,
}: {
  project: any
  canManageTasks: boolean
}) {
  const router = useRouter()
  const [data, setData] = useState(project)
  const [groupMode, setGroupMode] = useState<"workflow" | "sections">("workflow")
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [addingToSection, setAddingToSection] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const [isAddingSection, setIsAddingSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState("")
  const [boardError, setBoardError] = useState("")
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sectionInputRef = useRef<HTMLInputElement>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (addingToSection && inputRef.current) {
      inputRef.current.focus()
    }
  }, [addingToSection])
  useEffect(() => {
    if (isAddingSection && sectionInputRef.current) {
      sectionInputRef.current.focus()
    }
  }, [isAddingSection])

  const applyTaskUpdate = (updatedTask: any) => {
    setData((prev: any) => ({
      ...prev,
      sections: syncTaskInSections(prev.sections, updatedTask, { projectId: prev.id }),
    }))
    setSelectedTask((current: any) => current?.id === updatedTask.id ? { ...current, ...updatedTask } : current)
  }

  const handleToggleComplete = async (task: any) => {
    const nextStatus = task.status === "complete" ? "incomplete" : "complete"
    const transitionError = validateManualTaskTransition({
      from: task.status,
      to: nextStatus as TaskWorkflowStageId,
      qualityRequired: Boolean(task.quality_required),
      qualityState: task.quality_state || "not_required",
    })
    if (transitionError) {
      setBoardError(transitionError)
      return
    }
    if (updatingTaskId) return
    setBoardError("")
    setUpdatingTaskId(task.id)
    const previousStatus = task.status
    applyTaskUpdate({ ...task, status: nextStatus })
    const result = await updateTask(task.id, { status: nextStatus })
    if (result.error) {
      applyTaskUpdate({ ...task, status: previousStatus })
      setBoardError(result.error)
    } else if (result.task) {
      applyTaskUpdate(result.task)
    }
    setUpdatingTaskId(null)
  }

  const allTasks = data.sections.flatMap((section: any) => section.tasks)
  const columns = groupMode === "workflow"
    ? TASK_WORKFLOW_STAGES.map((stage) => ({
        id: `status:${stage.id}`,
        name: stage.label,
        tasks: allTasks.filter((task: any) => task.status === stage.id),
        workflowStatus: stage.id,
        manualTransition: stage.manualTransition,
      }))
    : data.sections.map((section: any) => ({
        ...section,
        workflowStatus: null,
        manualTransition: true,
      }))

  useEffect(() => {
    const taskId = searchParams?.get("taskId")
    if (!taskId || selectedTask) return

    const taskFromQuery = data.sections.flatMap((section: any) => section.tasks).find((task: any) => task.id === taskId)
    if (taskFromQuery) {
      const timeoutId = window.setTimeout(() => setSelectedTask(taskFromQuery), 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [data.sections, searchParams, selectedTask])

  const onDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    if (groupMode === "workflow") {
      if (destination.droppableId === source.droppableId) return
      const sourceTask = allTasks.find((task: any) => task.id === draggableId)
      const destinationStatus = destination.droppableId.replace("status:", "") as TaskWorkflowStageId
      if (!sourceTask) return

      const transitionError = validateManualTaskTransition({
        from: sourceTask.status,
        to: destinationStatus,
        qualityRequired: Boolean(sourceTask.quality_required),
        qualityState: sourceTask.quality_state || "not_required",
      })
      if (transitionError) {
        setBoardError(transitionError)
        return
      }

      setBoardError("")
      applyTaskUpdate({ ...sourceTask, status: destinationStatus })
      const updateResult = await updateTask(draggableId, { status: destinationStatus })
      if (updateResult?.error) {
        applyTaskUpdate(sourceTask)
        setBoardError(updateResult.error)
      } else if (updateResult?.task) {
        applyTaskUpdate(updateResult.task)
      }
      return
    }

    if (!canManageTasks) {
      setBoardError("Only project admins can move tasks between project sections")
      return
    }

    const previousSections = data.sections
    const sourceSectionIndex = data.sections.findIndex((s: any) => s.id === source.droppableId)
    const destSectionIndex = data.sections.findIndex((s: any) => s.id === destination.droppableId)
    
    // Create deep copy of sections and their tasks to avoid mutating React state
    const newSections = data.sections.map((s: any) => ({ ...s, tasks: [...s.tasks] }))
    const [sourceTask] = newSections[sourceSectionIndex].tasks.splice(source.index, 1)
    newSections[destSectionIndex].tasks.splice(destination.index, 0, sourceTask)
    setData({ ...data, sections: newSections })

    const updateResult = await updateTaskPosition(
      draggableId,
      destination.droppableId,
      destination.index,
      source.droppableId
    )

    if (updateResult?.error) {
      setData((prev: any) => ({ ...prev, sections: previousSections }))
      setBoardError(updateResult.error)
    } else if (updateResult?.task) {
      setBoardError("")
      applyTaskUpdate(updateResult.task)
    }
  }

  const handleAddTask = async (column: any) => {
    if (isCreatingTask) return
    const title = newTaskTitle.trim()
    if (!title) {
      setAddingToSection(null)
      return
    }

    const placement = resolveBoardTaskCreationPlacement({
      bucket: column,
      sections: data.sections,
      projectId: data.id,
      workspaceId: data.workspace_id,
    })
    if (!placement.success) {
      setBoardError(placement.error)
      return
    }
    const physicalSection = data.sections.find((section: any) => section.id === placement.input.section_id)
    const lastPosition = physicalSection?.tasks.reduce(
      (maximum: number, task: any) => Math.max(maximum, typeof task.position === "number" ? task.position : 0),
      0
    ) || null
    const tempTask = {
      id: `temp-${Date.now()}`,
      title,
      ...placement.input,
      position: nextTaskPosition(lastPosition),
      quality_required: false,
      quality_state: "not_required",
      priority: null,
      due_date: null,
      assignee: null,
      tags: [],
      comments: [],
      subtasks: [],
      attachments: [],
    }
    setData((current: any) => ({
      ...current,
      sections: syncTaskInSections(current.sections, tempTask, { projectId: current.id }),
    }))
    setBoardError("")
    setIsCreatingTask(true)

    const removeOptimisticTask = () => {
      setData((prev: any) => ({
        ...prev,
        sections: prev.sections.map((s: any) => ({
          ...s,
          tasks: s.tasks.filter((t: any) => t.id !== tempTask.id),
        })),
      }))
    }

    try {
      const result = await createTask({
        title,
        ...placement.input,
      })

      if (result.success && result.task) {
        setData((prev: any) => ({
          ...prev,
          sections: prev.sections.map((s: any) => ({
            ...s,
            tasks: s.tasks.map((t: any) => t.id === tempTask.id ? result.task : t),
          })),
        }))
        setNewTaskTitle("")
        setAddingToSection(null)
        router.refresh()
      } else {
        removeOptimisticTask()
        setBoardError(result.error || "Could not create the task")
      }
    } catch {
      removeOptimisticTask()
      setBoardError("Could not create the task")
    } finally {
      setIsCreatingTask(false)
    }
  }

  const handleAddSection = async () => {
    const name = newSectionName.trim()
    if (!name) {
      setIsAddingSection(false)
      return
    }

    const result = await createSection({
      name,
      project_id: data.id,
      position: (data.sections.length + 1) * 1000,
    })

    if (result.success && result.section) {
      setData((prev: any) => ({
        ...prev,
        sections: [...prev.sections, { ...result.section, tasks: [] }],
      }))
      setNewSectionName("")
      setIsAddingSection(false)
    }
  }

  const priorityConfig: Record<string, { bg: string; text: string }> = {
    high: { bg: "bg-red-500/20", text: "text-red-400" },
    medium: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
    low: { bg: "bg-blue-500/20", text: "text-blue-400" },
  }

  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => setIsMounted(true), [])
  if (!isMounted) return null

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex h-full min-h-0 flex-col bg-[#18181b] p-4 sm:p-6">
        <div className="mb-4 flex shrink-0 items-center justify-end gap-4 border-b border-[#3f3f46] pb-3">
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-medium text-[#a1a1aa] lg:block">
              {groupMode === "workflow"
                ? "Review states are changed only through the quality workflow"
                : "Drag tasks between sections to organize project work"}
            </span>
            <div className="flex rounded-lg border border-[#3f3f46] bg-[#202023] p-0.5" aria-label="Board grouping">
              <button
                type="button"
                onClick={() => {
                  setGroupMode("workflow")
                  setAddingToSection(null)
                  setNewTaskTitle("")
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${groupMode === "workflow" ? "bg-[#0075de] text-white" : "text-[#a1a1aa] hover:text-white"}`}
              >
                Workflow
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroupMode("sections")
                  setAddingToSection(null)
                  setNewTaskTitle("")
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${groupMode === "sections" ? "bg-[#0075de] text-white" : "text-[#a1a1aa] hover:text-white"}`}
              >
                Sections
              </button>
            </div>
          </div>
        </div>
        {boardError ? (
          <div role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300">
            {boardError}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
        <div className="flex min-w-max items-start gap-4 pb-5">
          {columns.map((section: any) => (
            <div key={section.id} className="group/section flex min-h-[420px] w-[calc(100vw-3rem)] shrink-0 flex-col sm:w-[320px]">
            {/* Section Header */}
            <div className="mb-2 flex min-h-11 items-center justify-between rounded-lg border border-[#3f3f46] bg-[#202023] px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="truncate text-xs font-bold uppercase tracking-wider text-[#f4f4f5]">{section.name}</h3>
                <span className="rounded-full bg-[#27272a] px-2 py-0.5 text-[10px] font-bold text-[#a1a1aa]">{section.tasks.length}</span>
              </div>
            </div>
            
            <Droppable
              droppableId={section.id}
              type="task"
              isDropDisabled={!section.manualTransition || (groupMode === "sections" && !canManageTasks)}
            >
              {(provided, snapshot) => (
                <div 
                  ref={provided.innerRef} 
                  {...provided.droppableProps}
                   className={`min-h-[120px] flex-1 space-y-2.5 rounded-xl border border-[#3f3f46] bg-[#18181b]/50 p-2.5 transition-colors ${snapshot.isDraggingOver ? "border-[#0075de]/50 bg-[#202023]" : ""}`}
                >
                  {section.manualTransition ? (
                    addingToSection === section.id ? (
                      <form
                        className="space-y-2 rounded-lg border border-[#3f3f46] bg-[#202023] p-2 shadow-sm"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void handleAddTask(section)
                        }}
                      >
                        <input
                          ref={inputRef}
                          type="text"
                          value={newTaskTitle}
                          disabled={isCreatingTask}
                          onChange={(event) => setNewTaskTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape" && !isCreatingTask) {
                              setAddingToSection(null)
                              setNewTaskTitle("")
                            }
                          }}
                          placeholder={`Task name in ${section.name}`}
                          aria-label={`Task name in ${section.name}`}
                          className="h-9 w-full rounded-md border border-[#0075de] bg-[#18181b] px-3 text-xs text-[#f4f4f5] outline-none disabled:opacity-60"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={isCreatingTask || !newTaskTitle.trim()}
                            className="rounded-full bg-[#0075de] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#005bab] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isCreatingTask ? "Adding..." : "Add task"}
                          </button>
                          <button
                            type="button"
                            disabled={isCreatingTask}
                            onClick={() => {
                              setAddingToSection(null)
                              setNewTaskTitle("")
                            }}
                            className="rounded-md p-1 text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5] disabled:opacity-50"
                            aria-label="Cancel adding task"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setBoardError("")
                          setAddingToSection(section.id)
                        }}
                        className="group/addtask flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs font-medium text-[#a1a1aa] transition-colors hover:bg-[#202023] hover:text-[#f4f4f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0075de]"
                        aria-label={`Add task to ${section.name}`}
                      >
                        <Plus className="h-3.5 w-3.5 text-[#71717a] transition-colors group-hover/addtask:text-[#0075de]" />
                        Add task
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={`${section.name} is controlled by the quality review workflow`}
                      className="flex h-8 w-full cursor-not-allowed items-center gap-1.5 rounded-md px-2 text-left text-xs font-medium text-[#71717a] opacity-70"
                      aria-label={`Add task to ${section.name} unavailable; this status is controlled by quality review`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add task
                      <span className="ml-auto text-[10px]">Quality controlled</span>
                    </button>
                  )}
                  {section.tasks.map((task: any, index: number) => (
                    <Draggable
                      key={task.id}
                      draggableId={task.id}
                      index={index}
                      isDragDisabled={
                        (groupMode === "workflow" && !section.manualTransition)
                        || (groupMode === "sections" && !canManageTasks)
                      }
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          style={{...provided.draggableProps.style}}
                        >
                          <Card 
                            onClick={(e) => {
                              if (e.defaultPrevented) return
                              setSelectedTask(task)
                            }}
                            className={`group/card relative cursor-pointer space-y-2.5 overflow-hidden border-[#3f3f46] bg-[#202023] p-3.5 shadow-sm transition-all hover:border-[#0075de]/50 hover:shadow-md ${
                              task.status === "complete" ? "opacity-70" : ""
                            } ${
                              snapshot.isDragging ? "z-50 rotate-1 bg-[#27272a] shadow-2xl ring-1 ring-[#0075de]/50" : ""
                            }`}
                          >
                            {/* Card Content */}
                            <div className="flex items-start gap-2">
                              {(() => {
                                const isComplete = task.status === "complete"
                                const isBlocked = Boolean(
                                  task.quality_required ||
                                    ["submitted", "needs_rework", "approved", "approved_with_notes"].includes(task.quality_state || "") ||
                                    ["submitted_for_review", "needs_rework"].includes(task.status)
                                )
                                return (
                                  <button
                                    type="button"
                                    disabled={isBlocked || updatingTaskId === task.id}
                                    aria-label={isComplete ? "Mark incomplete" : "Mark complete"}
                                    title={isBlocked ? "Quality approval required" : isComplete ? "Mark incomplete" : "Mark complete"}
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      void handleToggleComplete(task)
                                    }}
                                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0075de] ${
                                      isComplete ? "border-emerald-500 bg-emerald-500 text-white" : "border-[#71717a] bg-transparent text-transparent hover:border-emerald-500"
                                    } ${isBlocked ? "cursor-not-allowed opacity-60" : ""} ${updatingTaskId === task.id ? "opacity-50" : ""}`}
                                  >
                                    {isComplete ? <CheckCircle2 className="h-3.5 w-3.5 text-white" /> : <span className="h-2 w-2 rounded-full bg-emerald-500 opacity-0 group-hover/card:opacity-100 transition-opacity" />}
                                  </button>
                                )
                              })()}
                              <h4 dir="auto" className={`flex-1 text-xs font-semibold leading-5 transition-colors ${task.status === "complete" ? "text-[#71717a] line-through" : "text-[#f4f4f5] group-hover/card:text-[#0075de]"}`}>{task.title}</h4>
                              {(() => {
                                const isBlocked = Boolean(
                                  task.quality_required ||
                                    ["submitted", "needs_rework", "approved", "approved_with_notes"].includes(task.quality_state || "") ||
                                    ["submitted_for_review", "needs_rework"].includes(task.status)
                                )
                                return isBlocked ? <span title="Quality controlled"><ShieldCheck className="h-3 w-3 shrink-0 text-amber-400 mt-1" /></span> : null
                              })()}
                            </div>

                            {/* Tags */}
                            {["submitted_for_review", "needs_rework"].includes(task.status) ? (
                              <span className={`inline-flex w-fit rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${task.status === "needs_rework" ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300"}`}>
                                {getTaskWorkflowLabel(task.status)}
                              </span>
                            ) : null}
                            {task.tags?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {task.tags.map((t: any) => (
                                  <span key={t.id} className="rounded bg-[#0075de]/20 px-2 py-0.5 text-[10px] font-semibold text-[#60a5fa]">
                                    {t.tag.name}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Metadata */}
                            <div className="flex items-center justify-between border-t border-[#27272a] pt-2 text-[11px]">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                {task.due_date && (() => {
                                  const due = getDueDatePresentation(task.due_date)
                                  return (
                                    <span className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${due.className}`}>
                                      <Calendar className="w-3 h-3" />
                                      {due.label}
                                    </span>
                                  )
                                })()}
                                {task.priority && priorityConfig[task.priority] && (
                                  <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-widest text-[9px] ${priorityConfig[task.priority].bg} ${priorityConfig[task.priority].text}`}>
                                    {task.priority}
                                  </span>
                                )}
                                <div className="flex items-center gap-2 text-[#71717a]">
                                  {task.subtasks?.length > 0 && (
                                  <div className={`flex items-center gap-1 ${task.status === "complete" ? "text-emerald-400" : ""}`}>
                                      <CheckSquare className="w-3 h-3" />
                                      <span>{task.subtasks.filter((s: any) => s.status === 'complete').length}/{task.subtasks.length}</span>
                                    </div>
                                  )}
                                  {task.comments?.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <MessageSquare className="w-3 h-3" />
                                      <span>{task.comments.length}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1.5">
                                {task.status === "complete" ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> : null}
                                {task.assignee && (
                                <img 
                                  src={task.assignee.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(task.assignee.full_name)}&background=0075de&color=fff&size=32`} 
                                  className="h-5 w-5 shrink-0 rounded-full border border-[#3f3f46] ring-1 ring-[#27272a]" 
                                  alt={task.assignee.full_name} 
                                  title={task.assignee.full_name} 
                                />
                                )}
                              </div>
                            </div>
                          </Card>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
            </div>
          ))}
        
         {/* Add Section Placeholder */}
          {groupMode === "sections" && canManageTasks ? <div className="w-[calc(100vw-3rem)] shrink-0 sm:w-[320px]">
            {isAddingSection ? (
              <div className="rounded-xl border border-[#3f3f46] bg-[#202023] p-3 shadow-md">
                <input
                  ref={sectionInputRef}
                  value={newSectionName}
                  onChange={(event) => setNewSectionName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleAddSection()
                    if (event.key === "Escape") {
                      setIsAddingSection(false)
                      setNewSectionName("")
                    }
                  }}
                  placeholder="Section name"
                   className="h-9 w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-3 text-xs text-[#f4f4f5] outline-none focus:border-[#0075de]"
                />
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAddSection()}
                     className="rounded-full bg-[#0075de] px-3 py-1 text-xs font-semibold text-white hover:bg-[#005bab]"
                  >
                    Add section
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingSection(false)
                      setNewSectionName("")
                    }}
                    className="rounded-md px-3 py-1 text-xs font-medium text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#f4f4f5]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingSection(true)}
                 className="flex h-10 w-full items-center justify-center rounded-xl border border-dashed border-[#3f3f46] text-xs font-semibold text-[#a1a1aa] transition-colors hover:bg-[#202023] hover:text-[#f4f4f5]"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5 text-[#0075de]" /> Add section
              </button>
            )}
          </div> : null}
        </div>
        </div>
      </div>
      
      <TaskDrawer 
        key={selectedTask?.id || "empty-task"}
        task={selectedTask} 
        isOpen={!!selectedTask} 
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={applyTaskUpdate}
      />
    </DragDropContext>
  )
}
