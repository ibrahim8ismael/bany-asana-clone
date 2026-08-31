"use client"

import { useMemo, useState } from "react"
import { Check, Search, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { ProjectMemberAssignment, ProjectRole, WorkspaceRole } from "@/lib/project-membership"

export type ProjectWorkspaceMemberOption = {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  workspaceRole: WorkspaceRole
}

function workspaceRoleClasses(role: WorkspaceRole) {
  if (role === "owner") return "border-violet-500/25 bg-violet-500/10 text-violet-300"
  if (role === "admin") return "border-blue-500/25 bg-blue-500/10 text-blue-300"
  return "border-zinc-500/25 bg-zinc-500/10 text-zinc-400"
}

export default function ProjectMemberPicker({
  members,
  value,
  onChange,
  disabled = false,
  emptyTitle = "No eligible workspace members",
  emptyDescription = "Everyone in this workspace is already part of the project.",
}: {
  members: ProjectWorkspaceMemberOption[]
  value: ProjectMemberAssignment[]
  onChange: (value: ProjectMemberAssignment[]) => void
  disabled?: boolean
  emptyTitle?: string
  emptyDescription?: string
}) {
  const [query, setQuery] = useState("")
  const selectedByUserId = useMemo(
    () => new Map(value.map((member) => [member.userId, member.role])),
    [value],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const filteredMembers = useMemo(
    () => members.filter((member) => {
      if (!normalizedQuery) return true
      return member.full_name.toLowerCase().includes(normalizedQuery)
        || member.email.toLowerCase().includes(normalizedQuery)
    }),
    [members, normalizedQuery],
  )

  const toggleMember = (userId: string) => {
    if (disabled) return
    if (selectedByUserId.has(userId)) {
      onChange(value.filter((member) => member.userId !== userId))
      return
    }
    onChange([...value, { userId, role: "member" }])
  }

  const setRole = (userId: string, role: ProjectRole) => {
    const existing = selectedByUserId.has(userId)
    onChange(existing
      ? value.map((member) => member.userId === userId ? { ...member, role } : member)
      : [...value, { userId, role }])
  }

  const selectAllShown = () => {
    const selectedIds = new Set(value.map((member) => member.userId))
    onChange([
      ...value,
      ...filteredMembers
        .filter((member) => !selectedIds.has(member.id))
        .map((member) => ({ userId: member.id, role: "member" as const })),
    ])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            aria-label="Search workspace members"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
            className="h-10 pl-9"
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-zinc-400 sm:justify-end">
          <span>{value.length} selected</span>
          {filteredMembers.length > 0 ? (
            <button
              type="button"
              disabled={disabled}
              onClick={selectAllShown}
              className="font-semibold text-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              Select all shown
            </button>
          ) : null}
          {value.length > 0 ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange([])}
              className="font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50/60 custom-scrollbar dark:border-white/10 dark:bg-black/10">
        {members.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <Users className="h-8 w-8 text-zinc-400" />
            <div className="mt-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">{emptyTitle}</div>
            <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500 dark:text-zinc-400">{emptyDescription}</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No workspace members match “{query.trim()}”.
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-white/5">
            {filteredMembers.map((member) => {
              const selectedRole = selectedByUserId.get(member.id)
              const isSelected = Boolean(selectedRole)

              return (
                <div
                  key={member.id}
                  className={`grid gap-3 p-3 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${isSelected ? "bg-blue-50 dark:bg-blue-500/5" : "bg-white dark:bg-transparent"}`}
                >
                  <button
                    type="button"
                    aria-label={`${isSelected ? "Deselect" : "Select"} ${member.full_name}`}
                    aria-pressed={isSelected}
                    disabled={disabled}
                    onClick={() => toggleMember(member.id)}
                    className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${isSelected ? "border-blue-500 bg-blue-500 text-white" : "border-zinc-300 bg-white text-transparent hover:border-blue-400 dark:border-white/20 dark:bg-white/5"}`}
                  >
                    <Check className="h-4 w-4" />
                  </button>

                  <div className="flex min-w-0 items-center gap-3">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600 dark:bg-white/10 dark:text-white/70">
                        {member.full_name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-900 dark:text-white/90">{member.full_name}</div>
                      <div className="truncate text-xs text-zinc-500 dark:text-white/40">{member.email}</div>
                      <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${workspaceRoleClasses(member.workspaceRole)}`}>
                        Workspace {member.workspaceRole}
                      </span>
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-3 text-xs text-zinc-500 sm:justify-end dark:text-white/45">
                    <span>Project role</span>
                    <select
                      aria-label={`Project role for ${member.full_name}`}
                      value={selectedRole || "member"}
                      disabled={disabled}
                      onChange={(event) => setRole(member.id, event.target.value as ProjectRole)}
                      className="h-9 min-w-28 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-[#202123] dark:text-white/80"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  </label>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
