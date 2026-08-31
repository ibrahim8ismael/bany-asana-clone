"use client"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ChevronDown, Plus, X, CheckCircle, Flag, ShieldCheck } from "lucide-react"
import { getDueDatePresentation } from "@/lib/due-date"
import TaskDrawer from "@/components/task-drawer"
import { createTask, updateTask } from "@/actions/server-actions"
import { syncTaskInSections } from "@/lib/task-sync"
import { getTaskWorkflowLabel, getTaskWorkflowStage, isTaskWorkflowStage, validateManualTaskTransition } from "@/lib/workflow"

const priorityStyles: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-blue-100 text-blue-700",
}

export default function ListClient({ project }: { project: any }) {
  const [data, setData] = useState(project)
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [addingToSection, setAddingToSection] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)
  const [listError, setListError] = useState("")
  const searchParams = useSearchParams()

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const applyTaskUpdate = (updatedTask: any) => {
    setData((prev: any) => ({
      ...prev,
      sections: syncTaskInSections(prev.sections, updatedTask, { projectId: prev.id }),
    }))
    setSelectedTask((curr: any) => curr?.id === updatedTask.id ? { ...curr, ...updatedTask } : curr)
  }

  const handleToggleComplete = async (task: any) => {
    const nextStatus = task.status === "complete" ? "incomplete" : "complete"
    const transitionError = validateManualTaskTransition({
      from: task.status,
      to: nextStatus,
      qualityRequired: Boolean(task.quality_required),
      qualityState: task.quality_state || "not_required",
    })
    if (transitionError) {
      setListError(transitionError)
      return
    }
    if (updatingTaskId) return
    setListError("")
    setUpdatingTaskId(task.id)
    applyTaskUpdate({ ...task, status: nextStatus })
    const result = await updateTask(task.id, { status: nextStatus })
    if (result.error) {
      applyTaskUpdate(task)
      setListError(result.error)
    } else if (result.task) {
      applyTaskUpdate(result.task)
    }
    setUpdatingTaskId(null)
  }

  useEffect(() => {
    const taskId = searchParams?.get("taskId")
    if (!taskId || selectedTask) return

    const taskFromQuery = data.sections.flatMap((section: any) => section.tasks).find((task: any) => task.id === taskId)
    if (taskFromQuery) {
      const timeoutId = window.setTimeout(() => setSelectedTask(taskFromQuery), 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [data.sections, searchParams, selectedTask])

  const handleAddTask = async (sectionId: string) => {
    const title = newTaskTitle.trim()
    if (!title) { setAddingToSection(null); return }

    const tempTask = {
      id: `temp-${Date.now()}`,
      title,
      status: "incomplete",
      priority: null,
      due_date: null,
      assignee: null,
      tags: [],
      comments: [],
    }

    setData((prev: any) => ({
      ...prev,
      sections: prev.sections.map((s: any) =>
        s.id === sectionId ? { ...s, tasks: [...s.tasks, tempTask] } : s
      )
    }))
    setNewTaskTitle("")
    setAddingToSection(null)

    const result = await createTask({
      title,
      section_id: sectionId,
      project_id: data.id,
      workspace_id: data.workspace_id,
    })

    if (result.success && result.task) {
      setData((prev: any) => ({
        ...prev,
        sections: prev.sections.map((s: any) => ({
          ...s,
          tasks: s.tasks.map((t: any) => t.id === tempTask.id ? result.task : t)
        }))
      }))
    } else {
      setData((prev: any) => ({
        ...prev,
        sections: prev.sections.map((s: any) => ({
          ...s,
          tasks: s.tasks.filter((t: any) => t.id !== tempTask.id),
        })),
      }))
    }
  }

  return (
    <div className="space-y-4 pb-20">
      {listError ? <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300">{listError}</div> : null}
      {data.sections.map((section: any) => {
        const isCollapsed = collapsedSections.has(section.id)
        return (
          <div key={section.id}>
            {/* Section Header */}
            <div className="flex items-center gap-2 py-2 group border-b border-gray-200 dark:border-zinc-800 mb-1">
              <button onClick={() => toggleSection(section.id)} aria-label="Toggle section">
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
              </button>
              <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200 flex-1">{section.name}</h3>
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{section.tasks.length}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => { setAddingToSection(section.id); setTimeout(() => inputRef.current?.focus(), 50) }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded text-gray-500"
                  aria-label="Add task"
                >
                  <Plus className="w-3.5 h-3.5"/>
                </button>
              </div>
            </div>

            {!isCollapsed && (
              <>
                {/* Tasks Table */}
                {(section.tasks.length > 0 || addingToSection === section.id) && (
                  <div className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-hidden mb-2">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 dark:bg-zinc-900/50 text-gray-500 text-xs">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Task name</th>
                          <th className="px-4 py-2.5 font-medium w-36 border-l dark:border-zinc-700">Assignee</th>
                          <th className="px-4 py-2.5 font-medium w-28 border-l dark:border-zinc-700">Due date</th>
                          <th className="px-4 py-2.5 font-medium w-24 border-l dark:border-zinc-700">Priority</th>
                          <th className="px-4 py-2.5 font-medium w-24 border-l dark:border-zinc-700">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-zinc-800">
                        {section.tasks.map((task: any) => (
                          <tr 
                            key={task.id}
                            onClick={() => setSelectedTask(task)}
                            className="hover:bg-gray-50/60 dark:hover:bg-zinc-900/50 cursor-pointer group/row transition-colors"
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-3">
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
                                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                        isComplete ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300 dark:border-zinc-600 group-hover/row:border-blue-400 bg-transparent"
                                      } ${isBlocked ? "cursor-not-allowed opacity-60" : ""} ${updatingTaskId === task.id ? "opacity-50" : ""}`}
                                    >
                                      {isComplete ? <CheckCircle className="h-3 w-3 text-white" /> : null}
                                    </button>
                                  )
                                })()}
                                <span className={`truncate flex-1 font-medium ${task.status === "complete" ? "text-gray-400 line-through dark:text-zinc-500" : "text-gray-800 dark:text-gray-200"}`}>{task.title}</span>
                                {(() => {
                                  const blocked = Boolean(
                                    task.quality_required ||
                                      ["submitted", "needs_rework", "approved", "approved_with_notes"].includes(task.quality_state || "") ||
                                      ["submitted_for_review", "needs_rework"].includes(task.status)
                                  )
                                  return blocked ? <ShieldCheck className="h-3 w-3 shrink-0 text-amber-500" /> : null
                                })()}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 border-l dark:border-zinc-700">
                              {task.assignee ? (
                                <div className="flex items-center gap-2">
                                  <img 
                                    src={task.assignee.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(task.assignee.full_name)}&size=24`}
                                    className="w-5 h-5 rounded-full" 
                                    alt={task.assignee.full_name} 
                                  />
                                  <span className="truncate text-gray-600 dark:text-gray-300">{task.assignee.full_name}</span>
                                </div>
                              ) : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-2.5 border-l dark:border-zinc-700">
                              {task.due_date ? (() => {
                                const due = getDueDatePresentation(task.due_date)
                                return <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold ${due.className}`}>{due.label}</span>
                              })() : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-2.5 border-l dark:border-zinc-700">
                              {task.priority ? (
                                <span className={`uppercase text-[10px] font-bold tracking-wider px-2 py-0.5 rounded ${priorityStyles[task.priority] || "bg-gray-100 text-gray-500"}`}>
                                  {task.priority}
                                </span>
                              ) : ""}
                            </td>
                            <td className="px-4 py-2.5 border-l dark:border-zinc-700 capitalize text-xs">
                              <span className={`inline-flex rounded-full px-2 py-1 font-semibold ${isTaskWorkflowStage(task.status) ? getTaskWorkflowStage(task.status).badgeClass : "bg-gray-100 text-gray-500"}`}>
                                {getTaskWorkflowLabel(task.status)}
                              </span>
                            </td>
                          </tr>
                        ))}

                        {/* Inline Add Task Row */}
                        {addingToSection === section.id ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full border-2 border-blue-400 flex-shrink-0" />
                                <input
                                  ref={inputRef}
                                  type="text"
                                  value={newTaskTitle}
                                  onChange={(e) => setNewTaskTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleAddTask(section.id)
                                    if (e.key === "Escape") { setAddingToSection(null); setNewTaskTitle("") }
                                  }}
                                  autoFocus
                                  placeholder="Write a task name..."
                                  className="flex-1 text-sm outline-none bg-transparent dark:text-gray-100 placeholder:text-gray-400"
                                />
                                <button onClick={() => handleAddTask(section.id)} className="px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700">
                                  Add
                                </button>
                                <button onClick={() => { setAddingToSection(null); setNewTaskTitle("") }} className="p-0.5 text-gray-400 hover:text-gray-600" aria-label="Cancel">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add task button (shown when no inline input) */}
                {addingToSection !== section.id && (
                  <button
                    onClick={() => { setAddingToSection(section.id); setTimeout(() => inputRef.current?.focus(), 50) }}
                    className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1.5 font-medium py-1.5 px-2 rounded hover:bg-gray-100/50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add task
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}

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
