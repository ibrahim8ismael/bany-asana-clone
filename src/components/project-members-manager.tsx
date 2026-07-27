"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, UserPlus, X } from "lucide-react"
import { addProjectMember, removeProjectMember, updateProjectMemberRole } from "@/actions/server-actions"
import { Button } from "@/components/ui/button"

export type ProjectMemberItem = {
  id: string
  role: string
  user: {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
  }
}

export type WorkspaceMemberOption = {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
}

export type ProjectMemberManagementData = {
  canManage: boolean
  members: ProjectMemberItem[]
  workspaceMembers: WorkspaceMemberOption[]
}

function roleClasses(role: string) {
  switch (role) {
    case "owner":
      return "border-amber-500/20 bg-amber-500/10 text-amber-200"
    case "admin":
      return "border-blue-500/20 bg-blue-500/10 text-blue-200"
    case "editor":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
    case "commenter":
      return "border-violet-500/20 bg-violet-500/10 text-violet-200"
    default:
      return "border-white/10 bg-white/5 text-white/55"
  }
}

export default function ProjectMembersManager({
  projectId,
  canManage,
  members,
  workspaceMembers,
  layout = "default",
  reloadData,
}: {
  projectId: string
  canManage: boolean
  members: ProjectMemberItem[]
  workspaceMembers: WorkspaceMemberOption[]
  layout?: "default" | "compact"
  reloadData?: () => Promise<ProjectMemberManagementData>
}) {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [pending, startTransition] = useTransition()
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedRole, setSelectedRole] = useState<"admin" | "editor" | "commenter" | "viewer">("viewer")
  const [localMembers, setLocalMembers] = useState(members)
  const [localWorkspaceMembers, setLocalWorkspaceMembers] = useState(workspaceMembers)
  const [localCanManage, setLocalCanManage] = useState(canManage)

  useEffect(() => {
    setLocalMembers(members)
  }, [members])

  useEffect(() => {
    setLocalWorkspaceMembers(workspaceMembers)
  }, [workspaceMembers])

  useEffect(() => {
    setLocalCanManage(canManage)
  }, [canManage])

  const availableMembers = useMemo(() => {
    const currentIds = new Set(localMembers.map((member) => member.user.id))
    return localWorkspaceMembers.filter((member) => !currentIds.has(member.id))
  }, [localMembers, localWorkspaceMembers])

  useEffect(() => {
    if (availableMembers.some((member) => member.id === selectedUserId)) return
    setSelectedUserId(availableMembers[0]?.id || "")
  }, [availableMembers, selectedUserId])

  const compact = layout === "compact"

  const refreshMembers = async () => {
    if (!reloadData) {
      router.refresh()
      return
    }

    const nextData = await reloadData()
    setLocalCanManage(nextData.canManage)
    setLocalMembers(nextData.members)
    setLocalWorkspaceMembers(nextData.workspaceMembers)
  }

  const runAction = (action: () => Promise<{ success?: boolean; error?: string }>) => {
    setMessage("")
    startTransition(async () => {
      const result = await action()
      setMessage(result.success ? "Saved successfully." : result.error || "Action failed")
      if (result.success) await refreshMembers()
    })
  }

  return (
    <section className={compact ? "space-y-3" : "space-y-4"}>
      <div>
        <div className="flex items-center gap-2 text-white/85">
          <ShieldCheck className="h-4 w-4 text-blue-300" />
          <h3 className={compact ? "text-xs font-bold uppercase tracking-[0.2em] text-white/35" : "text-sm font-bold uppercase tracking-widest text-white/30"}>Members</h3>
        </div>
        <p className={compact ? "mt-2 text-[11px] leading-5 text-white/38" : "mt-2 text-xs leading-5 text-white/35"}>Project owners and project admins receive every notification for activity inside this project.</p>
      </div>

      {message ? <div className={compact ? "rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white/70" : "rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70"}>{message}</div> : null}

      <div className={compact ? "space-y-2.5" : "space-y-3"}>
        {localMembers.map((member) => (
          <div key={member.id} className={compact ? "flex flex-col gap-3 rounded-2xl border border-white/5 bg-[#202123] p-3" : "flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/5 bg-[#262729] p-4"}>
            <div className="flex items-center gap-3 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={member.user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.user.full_name)}&size=32`}
                alt={member.user.full_name}
                className={compact ? "h-8 w-8 rounded-full border border-white/5" : "h-9 w-9 rounded-full border border-white/5"}
              />
              <div className="min-w-0">
                <div className={compact ? "truncate text-sm font-medium text-white/88" : "truncate text-sm font-medium text-white/85"}>{member.user.full_name}</div>
                <div className="truncate text-xs text-white/35">{member.user.email}</div>
              </div>
            </div>

            <div className={compact ? "flex flex-wrap items-center gap-2" : "flex items-center gap-2 flex-wrap"}>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${roleClasses(member.role)}`}>
                {member.role}
              </span>

              {localCanManage && member.role !== "owner" ? (
                <>
                  <select
                    title="Update project role"
                    value={member.role}
                    disabled={pending}
                    onChange={(event) =>
                      runAction(() =>
                        updateProjectMemberRole({
                          projectId,
                          userId: member.user.id,
                          role: event.target.value as "admin" | "editor" | "commenter" | "viewer",
                        })
                      )
                    }
                    className={compact ? "h-9 rounded-xl border border-white/10 bg-[#17181a] px-3 text-xs text-white/80 outline-none" : "rounded-lg border border-white/10 bg-[#1f2022] px-3 py-2 text-xs text-white/80 outline-none"}
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="commenter">Commenter</option>
                    <option value="viewer">Viewer</option>
                  </select>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    className={compact ? "h-9 border-white/10 bg-transparent text-white/60 hover:bg-white/5 hover:text-white" : "h-8 border-white/10 bg-transparent text-white/60 hover:bg-white/5 hover:text-white"}
                    onClick={() => runAction(() => removeProjectMember({ projectId, userId: member.user.id }))}
                  >
                    <X className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {localCanManage ? (
        <div className={compact ? "rounded-2xl border border-dashed border-white/10 bg-[#1f2022] p-3 space-y-3" : "rounded-xl border border-dashed border-white/10 bg-[#1f2022] p-4 space-y-4"}>
          <div className={compact ? "flex items-center gap-2 text-xs font-medium text-white/80" : "flex items-center gap-2 text-sm font-medium text-white/80"}>
            <UserPlus className="h-4 w-4 text-orange-300" />
            Add workspace member to project
          </div>

          {availableMembers.length === 0 ? (
            <div className={compact ? "text-xs text-white/35" : "text-sm text-white/35"}>Everyone in the workspace is already part of this project.</div>
          ) : (
            <div className="flex flex-col gap-3">
              <select
                title="Select workspace member"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className={compact ? "h-9 rounded-xl border border-white/10 bg-[#262729] px-3 text-sm text-white/80 outline-none" : "h-10 rounded-lg border border-white/10 bg-[#262729] px-3 text-sm text-white/80 outline-none"}
              >
                {availableMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} ({member.email})
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-3">
                <select
                  title="Select project role"
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value as "admin" | "editor" | "commenter" | "viewer")}
                  className={compact ? "h-9 min-w-[160px] rounded-xl border border-white/10 bg-[#262729] px-3 text-sm text-white/80 outline-none" : "h-10 min-w-[180px] rounded-lg border border-white/10 bg-[#262729] px-3 text-sm text-white/80 outline-none"}
                >
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="commenter">Commenter</option>
                  <option value="viewer">Viewer</option>
                </select>

                <Button
                  type="button"
                  disabled={pending || !selectedUserId}
                  className={compact ? "h-9 bg-orange-500 text-white hover:bg-orange-400" : "h-10 bg-orange-500 text-white hover:bg-orange-400"}
                  onClick={() =>
                    runAction(() =>
                      addProjectMember({
                        projectId,
                        userId: selectedUserId,
                        role: selectedRole,
                      })
                    )
                  }
                >
                  Add to project
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
