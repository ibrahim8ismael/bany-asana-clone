"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { CheckCircle2, Calendar, ShieldCheck, ArrowLeft } from "lucide-react"
import { getDueDatePresentation } from "@/lib/due-date"
import Link from "next/link"
import { updateTask } from "@/actions/server-actions"
import { validateManualTaskTransition } from "@/lib/workflow"

const TaskDrawer = dynamic(() => import("./task-drawer"), { ssr: false })

interface PeopleTasksClientProps {
  targetUser: { id: string; full_name: string; email: string; avatar_url: string | null }
  tasks: any[]
  workspaceName: string
}

export default function PeopleTasksClient({ targetUser, tasks: initialTasks, workspaceName }: PeopleTasksClientProps) {
  const [tasks, setTasks] = useState(initialTasks)
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const handleToggleComplete = async (task: any) => {
    const nextStatus = task.status === "complete" ? "incomplete" : "complete"
    const transitionError = validateManualTaskTransition({
      from: task.status,
      to: nextStatus,
      qualityRequired: Boolean(task.quality_required),
      qualityState: task.quality_state || "not_required",
    })
    if (transitionError) {
      setError(transitionError)
      return
    }
    if (updatingId) return
    setError("")
    setUpdatingId(task.id)
    const prevTasks = tasks
    // optimistic: mark complete will remove from list (filter), incomplete would keep
    // Since page shows only incomplete, completing should remove row optimistically
    if (nextStatus === "complete") {
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
    } else {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)))
    }

    const result = await updateTask(task.id, { status: nextStatus })
    if (result.error) {
      setTasks(prevTasks)
      setError(result.error)
    } else if (result.task) {
      if (result.task.status === "complete") {
        // keep filtered out
        setTasks((prev) => prev.filter((t) => t.id !== task.id))
      } else {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? result.task : t)))
      }
      if (selectedTask?.id === task.id) setSelectedTask(result.task)
    }
    setUpdatingId(null)
  }

  const applyTaskUpdate = (updatedTask: any) => {
    // if completed, remove; else upsert
    if (updatedTask.status === "complete") {
      setTasks((prev) => prev.filter((t) => t.id !== updatedTask.id))
    } else {
      setTasks((prev) => {
        const exists = prev.some((t) => t.id === updatedTask.id)
        return exists ? prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)) : [updatedTask, ...prev]
      })
    }
    setSelectedTask((curr: any) => curr?.id === updatedTask.id ? updatedTask : curr)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#18181b]">
      <div className="shrink-0 border-b border-[#3f3f46] bg-[#202023] px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/home" className="flex h-8 w-8 items-center justify-center rounded-md border border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] hover:text-[#f4f4f5]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <img
            src={targetUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(targetUser.full_name)}&background=0075de&color=fff&size=48`}
            alt={targetUser.full_name}
            className="h-10 w-10 rounded-full border border-[#3f3f46] object-cover"
          />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-[#f4f4f5]">{targetUser.full_name}</h1>
            <p className="truncate text-xs text-[#a1a1aa]">{targetUser.email} • {workspaceName}</p>
          </div>
          <span className="ml-auto hidden rounded-full border border-[#3f3f46] bg-[#18181b] px-3 py-1 text-xs font-semibold text-[#a1a1aa] sm:inline">
            {tasks.length} incomplete tasks
          </span>
        </div>
      </div>

      {error ? <p role="alert" className="mx-4 mt-3 shrink-0 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 sm:mx-6">{error}</p> : null}

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500/60 mb-3" />
            <p className="text-sm font-semibold text-[#f4f4f5]">No incomplete tasks</p>
            <p className="text-xs text-[#a1a1aa] mt-1">{targetUser.full_name} is all caught up.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const isComplete = task.status === "complete"
              const isBlocked = Boolean(
                task.quality_required ||
                  ["submitted", "needs_rework", "approved", "approved_with_notes"].includes(task.quality_state || "") ||
                  ["submitted_for_review", "needs_rework"].includes(task.status)
              )
              const disabled = isBlocked || updatingId === task.id
              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="group flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-[#3f3f46] bg-[#202023] px-3 py-3 transition-colors hover:border-[#0075de]/50 hover:bg-[#27272a] sm:px-4"
                >
                  <button
                    type="button"
                    disabled={Boolean(isBlocked)}
                    aria-label={isComplete ? "Mark incomplete" : "Mark complete"}
                    title={isBlocked ? "Quality approval required" : isComplete ? "Mark incomplete" : "Mark complete"}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void handleToggleComplete(task)
                    }}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0075de] ${
                      isComplete ? "border-emerald-500 bg-emerald-500 text-white" : "border-[#71717a] bg-transparent text-transparent hover:border-emerald-500"
                    } ${isBlocked ? "cursor-not-allowed opacity-60" : ""} ${updatingId === task.id ? "opacity-50" : ""}`}
                  >
                    {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-medium ${isComplete ? "text-[#71717a] line-through" : "text-[#f4f4f5]"}`}>{task.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {task.project ? (
                        <span className="shrink-0 rounded bg-[#18181b] px-1.5 py-0.5 text-[10px] font-semibold text-[#a1a1aa] border border-[#3f3f46] truncate max-w-[140px]">{task.project.name}</span>
                      ) : task.client ? (
                        <span className="shrink-0 rounded bg-[#18181b] px-1.5 py-0.5 text-[10px] font-semibold text-[#a1a1aa] border border-[#3f3f46] truncate max-w-[140px]">{task.client.name}</span>
                      ) : null}
                      {task.due_date ? (() => {
                        const due = getDueDatePresentation(task.due_date)
                        return (
                          <span className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${due.className}`}>
                            <Calendar className="h-3 w-3" />
                            {due.label}
                          </span>
                        )
                      })() : null}
                      {isBlocked ? <span title="Quality controlled"><ShieldCheck className="h-3 w-3 text-amber-400" /></span> : null}
                    </div>
                  </div>

                  {updatingId === task.id ? <span className="text-[11px] text-[#a1a1aa]">Saving...</span> : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

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
