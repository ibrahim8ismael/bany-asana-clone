"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createProject, getProjectCreationMemberOptions } from "@/actions/server-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import ProjectMemberPicker, { type ProjectWorkspaceMemberOption } from "@/components/project-member-picker"
import type { ProjectMemberAssignment } from "@/lib/project-membership"
import { X, LayoutGrid, List, Calendar, GitBranch, Loader2, ShieldCheck, Users } from "lucide-react"

const views = [
  { key: "list", label: "List", icon: List },
  { key: "board", label: "Board", icon: LayoutGrid },
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "timeline", label: "Timeline", icon: GitBranch },
]

const colors = [
  "#9f8fef", "#ec4899", "#f06a6a", "#14b8a6", "#84cc16", "#ef4444", "#4573d2", "#8b5cf6"
]

interface ProjectClientOption {
  id: string
  name: string
  color?: string | null
}

export default function CreateProjectModal({
  isOpen,
  onClose,
  clients,
  initialClientId,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  clients: ProjectClientOption[]
  initialClientId?: string | null
  onSuccess?: (project: { id: string; name: string; color?: string | null; default_view: string; client_id?: string | null }) => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [deadline, setDeadline] = useState("")
  const [defaultView, setDefaultView] = useState("list")
  const [color, setColor] = useState(colors[0])
  const [clientId, setClientId] = useState(initialClientId || clients[0]?.id || "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState("")
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [workspaceMembers, setWorkspaceMembers] = useState<ProjectWorkspaceMemberOption[]>([])
  const [selectedMembers, setSelectedMembers] = useState<ProjectMemberAssignment[]>([])
  const router = useRouter()

  useEffect(() => {
    if (!isOpen) return
    setClientId(initialClientId || clients[0]?.id || "")
  }, [clients, initialClientId, isOpen])

  useEffect(() => {
    if (!isOpen || !clientId) {
      setOwnerId(null)
      setWorkspaceMembers([])
      setSelectedMembers([])
      setMembersError("")
      return
    }

    let cancelled = false
    setMembersLoading(true)
    setMembersError("")
    setSelectedMembers([])

    void getProjectCreationMemberOptions(clientId).then((result) => {
      if (cancelled) return
      if (result.success) {
        setOwnerId(result.ownerId)
        setWorkspaceMembers(result.members)
      } else {
        setOwnerId(null)
        setWorkspaceMembers([])
        setMembersError(result.error || "Failed to load workspace members")
      }
      setMembersLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [clientId, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !clientId) return
    setLoading(true)
    setError("")

    const result = await createProject({ 
      name: name.trim(),
      description: description.trim(),
      deadline: deadline || null,
      default_view: defaultView,
      client_id: clientId,
      color,
      members: selectedMembers,
    })
    
    setLoading(false)
    if (result.success && result.project) {
      onClose()
      setName("")
      setDescription("")
      setDeadline("")
      setSelectedMembers([])
      if (onSuccess) {
        onSuccess(result.project)
      } else {
        router.push(`/projects/${result.project.id}/${defaultView}`)
      }
      router.refresh()
    } else {
      setError(result.error || "Failed to create project. Please try again.")
    }
  }

  const owner = workspaceMembers.find((member) => member.id === ownerId) || null
  const eligibleMembers = workspaceMembers.filter((member) => member.id !== ownerId)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl ring-1 ring-gray-200 dark:bg-zinc-950 dark:ring-zinc-800 sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl sm:rounded-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 dark:border-zinc-800 sm:px-6 sm:py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Create new project</h2>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 custom-scrollbar sm:p-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="proj-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">Project Name *</Label>
            <Input 
              id="proj-name"
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. Q4 Marketing Campaign" 
              required
              autoFocus
              className="h-10"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="proj-desc" className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</Label>
            <textarea
              id="proj-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-md outline-none focus:ring-2 ring-blue-500/30 bg-white dark:bg-zinc-900 dark:text-gray-200 resize-none placeholder:text-gray-400"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="proj-deadline" className="text-sm font-medium text-gray-700 dark:text-gray-300">Deadline</Label>
            <Input
              id="proj-deadline"
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="h-10"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">Optional. Use this for the overall project delivery date.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proj-client" className="text-sm font-medium text-gray-700 dark:text-gray-300">Client *</Label>
            <select
              id="proj-client"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-200"
            >
              {clients.length === 0 ? <option value="">Create a client first</option> : null}
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <section className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <Users className="h-4 w-4 text-blue-500" />
                  Project members
                </div>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Choose people from this workspace and assign each person an Admin or Member role.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-500">
                Optional
              </span>
            </div>

            {membersLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 px-4 py-10 text-sm text-gray-500 dark:border-zinc-700 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading workspace members...
              </div>
            ) : membersError ? (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-300">
                {membersError}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-500/20 dark:bg-violet-500/5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900 dark:text-white/90">{owner?.full_name || "You"}</div>
                    <div className="truncate text-xs text-gray-500 dark:text-white/40">{owner?.email || "Project creator"}</div>
                  </div>
                  <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">
                    Owner
                  </span>
                </div>

                <ProjectMemberPicker
                  members={eligibleMembers}
                  value={selectedMembers}
                  onChange={setSelectedMembers}
                  disabled={loading}
                  emptyTitle="No other workspace members"
                  emptyDescription="Invite people to the workspace before assigning them to this project."
                />
              </>
            )}
          </section>

          {/* Color */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Color</Label>
            <div className="flex gap-2 flex-wrap">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Default View */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Default View</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {views.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setDefaultView(v.key)}
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-xs font-medium transition-all ${
                    defaultView === v.key
                      ? "bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-400"
                      : "border-gray-200 dark:border-zinc-700 text-gray-500 hover:border-gray-300 dark:hover:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-900"
                  }`}
                >
                  <v.icon className="w-4 h-4" />
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {clients.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-300">
              Create a client first, then create projects under it.
            </div>
          ) : null}

          {/* Actions */}
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="w-full sm:w-auto">Cancel</Button>
            <Button type="submit" disabled={loading || membersLoading || Boolean(membersError) || !name.trim() || !clientId || clients.length === 0} className="w-full px-6 sm:w-auto">
              {loading ? "Creating..." : selectedMembers.length > 0 ? `Create with ${selectedMembers.length + 1} members` : "Create Project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
