"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { Card } from "@/components/ui/card"
import { format, isPast, isToday } from "date-fns"
import { MessageSquare, CheckSquare, Plus, X, Calendar } from "lucide-react"
import { createSection, createTask, updateTaskPosition } from "@/actions/server-actions"
import { syncTaskInSections } from "@/lib/task-sync"

const TaskDrawer = dynamic(() => import("@/components/task-drawer"), { ssr: false })

export default function BoardClient({ project }: { project: any }) {
  const [data, setData] = useState(project)
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [addingToSection, setAddingToSection] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [isAddingSection, setIsAddingSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState("")
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

  const onDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

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
    } else if (updateResult?.task) {
      applyTaskUpdate(updateResult.task)
    }
  }

  const handleAddTask = async (sectionId: string) => {
    const title = newTaskTitle.trim()
    if (!title) {
      setAddingToSection(null)
      return
    }

    const tempTask = {
      id: `temp-${Date.now()}`,
      title,
      status: "incomplete",
      priority: null,
      due_date: null,
      assignee: null,
      tags: [],
      comments: [],
      subtasks: [],
      attachments: [],
    }
    const newSections = data.sections.map((s: any) =>
      s.id === sectionId ? { ...s, tasks: [...s.tasks, tempTask] } : s
    )
    setData({ ...data, sections: newSections })
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
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-4 flex shrink-0 items-center justify-between gap-4 border-b border-[#414245] pb-4">
          <button
            onClick={() => data.sections[0] && setAddingToSection(data.sections[0].id)}
            disabled={data.sections.length === 0}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#56575a] bg-[#292a2c] px-3 text-sm font-semibold text-white/90 transition-colors hover:bg-[#343537] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Add task
          </button>
          <span className="hidden text-xs text-white/35 sm:block">Drag tasks between sections to update progress</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
        <div className="flex min-w-max items-start gap-4 pb-5">
          {data.sections.map((section: any) => (
            <div key={section.id} className="group/section flex min-h-[420px] w-[calc(100vw-3rem)] shrink-0 flex-col sm:w-[320px]">
            {/* Section Header */}
            <div className="mb-3 flex min-h-14 items-center justify-between rounded-lg bg-[#28292b] px-4">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="truncate text-[15px] font-semibold text-white/90">{section.name}</h3>
                <span className="text-sm text-white/40">{section.tasks.length}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover/section:opacity-100 transition-opacity">
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 hover:bg-white/5 hover:text-white/80"
                  aria-label="Add task to section"
                  onClick={() => setAddingToSection(section.id)}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            
            <Droppable droppableId={section.id} type="task">
              {(provided, snapshot) => (
                <div 
                  ref={provided.innerRef} 
                  {...provided.droppableProps}
                   className={`min-h-[120px] flex-1 space-y-2 rounded-lg border border-transparent bg-[#242527] p-3 transition-colors ${snapshot.isDraggingOver ? "border-[#6f7074] bg-[#292a2c]" : ""}`}
                >
                  {section.tasks.map((task: any, index: number) => (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
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
                            className={`group/card relative cursor-pointer space-y-3 overflow-hidden border-[#47484b] bg-[#2d2e30] p-4 shadow-none transition-all hover:border-[#65666a] ${
                              task.status === "complete" ? "opacity-80" : ""
                            } ${
                              snapshot.isDragging ? "z-50 rotate-1 bg-[#36373a] shadow-2xl shadow-black/30 ring-1 ring-white/15" : "hover:bg-[#323335]"
                            }`}
                          >
                            {/* Card Content */}
                            <div className="flex items-start justify-between gap-2">
                              <h4 dir="auto" className={`w-full text-[14px] font-medium leading-6 transition-colors ${task.status === "complete" ? "text-white/35 line-through" : "text-white/90 group-hover/card:text-white"}`}>{task.title}</h4>
                            </div>

                            {/* Tags */}
                            {["submitted_for_review", "needs_rework"].includes(task.status) ? (
                              <span className={`inline-flex w-fit rounded px-2 py-0.5 text-[10px] font-semibold ${task.status === "needs_rework" ? "bg-rose-500/10 text-rose-300" : "bg-amber-500/10 text-amber-300"}`}>
                                {task.status.replace(/_/g, " ")}
                              </span>
                            ) : null}
                            {task.tags?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {task.tags.map((t: any) => (
                                  <span key={t.id} className="rounded bg-[#4573d2]/18 px-2 py-0.5 text-[10px] font-semibold text-[#8eb2ff]">
                                    {t.tag.name}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Metadata */}
                            <div className="flex items-center justify-between border-t border-[#424346] pt-3 text-[11px]">
                              <div className="flex items-center gap-3 flex-wrap">
                                {task.due_date && (
                                    <span className={`flex items-center gap-1.5 font-medium ${isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date)) ? 'text-[#ff8b8b]' : isToday(new Date(task.due_date)) ? 'text-[#8eb2ff]' : 'text-white/45'}`}>
                                    <Calendar className="w-3 h-3" />
                                    {format(new Date(task.due_date), 'MMM d')}
                                  </span>
                                )}
                                {task.priority && priorityConfig[task.priority] && (
                                  <span className={`px-2 py-0.5 rounded-[4px] font-bold uppercase tracking-widest text-[9px] ${priorityConfig[task.priority].bg} ${priorityConfig[task.priority].text}`}>
                                    {task.priority}
                                  </span>
                                )}
                                <div className="flex items-center gap-2.5 text-white/30">
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
                              
                              <div className="flex items-center gap-2">
                                {task.status === "complete" ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> : null}
                                {task.assignee && (
                                <img 
                                  src={task.assignee.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(task.assignee.full_name)}&background=random&color=fff&size=32`} 
                                  className="h-6 w-6 shrink-0 rounded-full border border-white/15 ring-2 ring-[#2d2e30] transition-all group-hover/card:ring-[#323335]" 
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

            {/* Add Task input */}
            <div className="mt-2 group/addtask">
              {addingToSection === section.id ? (
                <div className="space-y-2 p-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddTask(section.id)
                      if (e.key === "Escape") { setAddingToSection(null); setNewTaskTitle("") }
                    }}
                    placeholder="Task name"
                     className="h-10 w-full rounded-md border border-[#f06a6a] bg-[#323335] px-3 text-sm text-white outline-none shadow-lg shadow-black/10"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAddTask(section.id)}
                       className="rounded-md bg-[#f06a6a] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#e45f5f]"
                    >
                      Add task
                    </button>
                    <button
                      onClick={() => { setAddingToSection(null); setNewTaskTitle("") }}
                      className="p-1.5 text-white/40 hover:text-white/60 hover:bg-white/5 rounded-md"
                      aria-label="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingToSection(section.id)}
                   className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[13px] font-medium text-white/35 transition-colors hover:bg-white/5 hover:text-white/75"
                >
                  <Plus className="w-4 h-4 text-white/20 group-hover/addtask:text-white/50" />
                  Add task
                </button>
              )}
            </div>
            </div>
          ))}
        
         {/* Add Section Placeholder */}
          <div className="w-[calc(100vw-3rem)] shrink-0 sm:w-[320px]">
            {isAddingSection ? (
              <div className="rounded-lg border border-[#47484b] bg-[#2a2b2d] p-4">
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
                   className="h-10 w-full rounded-md border border-[#56575a] bg-white/5 px-3 text-sm text-white outline-none focus:border-[#f06a6a]"
                />
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => void handleAddSection()}
                     className="rounded-md bg-[#f06a6a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e45f5f]"
                  >
                    Add section
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingSection(false)
                      setNewSectionName("")
                    }}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-white/50 hover:bg-white/5 hover:text-white/80"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingSection(true)}
                 className="flex h-11 w-full items-center justify-center rounded-lg border border-dashed border-[#515255] text-sm font-medium text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
              >
                <Plus className="w-4 h-4 mr-2" /> Add section
              </button>
            )}
          </div>
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
