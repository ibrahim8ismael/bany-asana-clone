"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, UserPlus, X } from "lucide-react"
import { addProjectMembers, removeProjectMember, transferProjectOwnership, updateProjectMemberRole } from "@/actions/server-actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ProjectMemberPicker, { type ProjectWorkspaceMemberOption } from "@/components/project-member-picker"
import type { ProjectEffectiveRole, ProjectMemberAssignment, ProjectRole } from "@/lib/project-membership"

export type ProjectMemberItem = {
  id: string
  role: ProjectRole
  effectiveRole: ProjectEffectiveRole
  isOwner: boolean
  user: {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
  }
}

export type WorkspaceMemberOption = ProjectWorkspaceMemberOption

export type ProjectMemberManagementData = {
  canManage: boolean
  canTransferOwnership: boolean
  ownerId: string | null
  members: ProjectMemberItem[]
  workspaceMembers: WorkspaceMemberOption[]
}

function roleClasses(role: string) {
  switch (role) {
    case "owner":
      return "border-violet-500/20 bg-violet-500/10 text-violet-200"
    case "admin":
      return "border-blue-500/20 bg-blue-500/10 text-blue-200"
    case "member":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
    default:
      return "border-white/10 bg-white/5 text-white/55"
  }
}

export default function ProjectMembersManager({
  projectId,
  canManage,
  canTransferOwnership,
  ownerId,
  members,
  workspaceMembers,
  layout = "default",
  reloadData,
}: {
  projectId: string
  canManage: boolean
  canTransferOwnership: boolean
  ownerId: string | null
  members: ProjectMemberItem[]
  workspaceMembers: WorkspaceMemberOption[]
  layout?: "default" | "compact"
  reloadData?: () => Promise<ProjectMemberManagementData>
}) {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [pending, startTransition] = useTransition()
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false)
  const [selectedMembers, setSelectedMembers] = useState<ProjectMemberAssignment[]>([])
  const [selectedTransferUserId, setSelectedTransferUserId] = useState("")
  const [localMembers, setLocalMembers] = useState(members)
  const [localWorkspaceMembers, setLocalWorkspaceMembers] = useState(workspaceMembers)
  const [localCanManage, setLocalCanManage] = useState(canManage)
  const [localCanTransferOwnership, setLocalCanTransferOwnership] = useState(canTransferOwnership)
  const [localOwnerId, setLocalOwnerId] = useState(ownerId)

  useEffect(() => {
    setLocalMembers(members)
  }, [members])

  useEffect(() => {
    setLocalWorkspaceMembers(workspaceMembers)
  }, [workspaceMembers])

  useEffect(() => {
    setLocalCanManage(canManage)
  }, [canManage])

  useEffect(() => {
    setLocalCanTransferOwnership(canTransferOwnership)
    setLocalOwnerId(ownerId)
  }, [canTransferOwnership, ownerId])

  const availableMembers = useMemo(() => {
    const currentIds = new Set(localMembers.map((member) => member.user.id))
    return localWorkspaceMembers.filter((member) => !currentIds.has(member.id))
  }, [localMembers, localWorkspaceMembers])

  const availableTransferTargets = useMemo(
    () => localWorkspaceMembers.filter((member) => member.id !== localOwnerId),
    [localOwnerId, localWorkspaceMembers]
  )

  useEffect(() => {
    const availableIds = new Set(availableMembers.map((member) => member.id))
    setSelectedMembers((current) => current.filter((member) => availableIds.has(member.userId)))
  }, [availableMembers])

  useEffect(() => {
    if (availableTransferTargets.some((member) => member.id === selectedTransferUserId)) return
    setSelectedTransferUserId(availableTransferTargets[0]?.id || "")
  }, [availableTransferTargets, selectedTransferUserId])

  const compact = layout === "compact"

  const refreshMembers = async () => {
    if (!reloadData) {
      router.refresh()
      return
    }

    const nextData = await reloadData()
    setLocalCanManage(nextData.canManage)
    setLocalCanTransferOwnership(nextData.canTransferOwnership)
    setLocalOwnerId(nextData.ownerId)
    setLocalMembers(nextData.members)
    setLocalWorkspaceMembers(nextData.workspaceMembers)
  }

  const runAction = (
    action: () => Promise<{ success?: boolean; error?: string }>,
    onSuccess?: () => void,
  ) => {
    setMessage("")
    startTransition(async () => {
      const result = await action()
      setMessage(result.success ? "Saved successfully." : result.error || "Action failed")
      if (result.success) {
        await refreshMembers()
        onSuccess?.()
      }
    })
  }

  return (
    <section className={compact ? "space-y-3" : "space-y-4"}>
      <div>
        <div className="flex items-center gap-2 text-white/85">
          <ShieldCheck className="h-4 w-4 text-blue-300" />
          <h3 className={compact ? "text-xs font-bold uppercase tracking-[0.2em] text-white/35" : "text-sm font-bold uppercase tracking-widest text-white/30"}>Members</h3>
        </div>
        <p className={compact ? "mt-2 text-[11px] leading-5 text-white/38" : "mt-2 text-xs leading-5 text-white/35"}>Project owners and admins can manage members and settings. Members can participate in project work.</p>
      </div>

      {message ? <div className={compact ? "rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white/70" : "rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70"}>{message}</div> : null}

      <div className={compact ? "space-y-2.5" : "space-y-3"}>
        {localMembers.map((member) => (
          <div key={member.id} className={compact ? "flex flex-col gap-3 rounded-2xl border border-white/5 bg-[#202123] p-3" : "flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/5 bg-[#262729] p-4"}>
            <div className="flex items-center gap-3 min-w-0">
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
              <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${roleClasses(member.effectiveRole)}`}>
                {member.effectiveRole}
              </span>

              {localCanManage && !member.isOwner ? (
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
                          role: event.target.value as ProjectRole,
                        })
                      )
                    }
                    className={compact ? "h-9 rounded-xl border border-white/10 bg-[#17181a] px-3 text-xs text-white/80 outline-none" : "rounded-lg border border-white/10 bg-[#1f2022] px-3 py-2 text-xs text-white/80 outline-none"}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
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
              ) : member.isOwner ? (
                <span className="text-[10px] leading-4 text-violet-200/55">Use ownership transfer to change the owner.</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {localCanManage ? (
        <div className={compact ? "rounded-2xl border border-dashed border-orange-400/20 bg-orange-400/5 p-3" : "rounded-xl border border-dashed border-orange-400/20 bg-orange-400/5 p-4"}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className={compact ? "flex items-center gap-2 text-xs font-medium text-white/85" : "flex items-center gap-2 text-sm font-medium text-white/85"}>
                <UserPlus className="h-4 w-4 text-orange-300" />
                Add people from this workspace
              </div>
              <p className={compact ? "mt-1.5 text-[11px] leading-5 text-white/40" : "mt-1.5 text-xs leading-5 text-white/40"}>
                Search eligible members, select one or more, and assign project roles.
              </p>
            </div>
            <Button
              type="button"
              disabled={pending || availableMembers.length === 0}
              onClick={() => setIsAddMembersOpen(true)}
              className={compact ? "h-9 shrink-0 bg-orange-500 text-white hover:bg-orange-400" : "h-10 shrink-0 bg-orange-500 text-white hover:bg-orange-400"}
            >
              <UserPlus className="h-4 w-4" />
              {availableMembers.length > 0 ? "Add members" : "All members added"}
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={isAddMembersOpen}
        onOpenChange={(open) => {
          setIsAddMembersOpen(open)
          if (!open) setSelectedMembers([])
        }}
      >
        <DialogContent className="border-white/10 bg-[#1f2022] text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5 text-orange-300" />
              Add members
            </DialogTitle>
            <DialogDescription className="text-white/45">
              Only members of this project’s workspace are eligible. Choose each person’s project role before adding them.
            </DialogDescription>
          </DialogHeader>

          <ProjectMemberPicker
            members={availableMembers}
            value={selectedMembers}
            onChange={setSelectedMembers}
            disabled={pending}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setIsAddMembersOpen(false)}
              className="border-white/10 bg-transparent text-white/70 hover:bg-white/5 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || selectedMembers.length === 0}
              onClick={() => runAction(
                () => addProjectMembers({ projectId, members: selectedMembers }),
                () => {
                  setSelectedMembers([])
                  setIsAddMembersOpen(false)
                },
              )}
              className="bg-orange-500 text-white hover:bg-orange-400"
            >
              {pending ? "Adding..." : `Add ${selectedMembers.length || "selected"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {localCanTransferOwnership ? (
        <div className={compact ? "rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3 space-y-3" : "rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-4"}>
          <div className={compact ? "text-xs font-medium text-violet-100" : "text-sm font-medium text-violet-100"}>Transfer project ownership</div>
          <p className={compact ? "text-[11px] leading-5 text-violet-100/55" : "text-xs leading-5 text-violet-100/55"}>The new owner must already belong to this workspace. You will remain an Admin after the transfer.</p>
          {availableTransferTargets.length === 0 ? (
            <div className="text-xs text-white/35">No other workspace members are eligible.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <select
                title="Select new project owner"
                value={selectedTransferUserId}
                onChange={(event) => setSelectedTransferUserId(event.target.value)}
                className={compact ? "h-9 min-w-[180px] rounded-xl border border-white/10 bg-[#262729] px-3 text-sm text-white/80 outline-none" : "h-10 min-w-[220px] rounded-lg border border-white/10 bg-[#262729] px-3 text-sm text-white/80 outline-none"}
              >
                {availableTransferTargets.map((member) => (
                  <option key={member.id} value={member.id}>{member.full_name} ({member.email})</option>
                ))}
              </select>
              <Button
                type="button"
                disabled={pending || !selectedTransferUserId}
                className={compact ? "h-9 bg-violet-600 text-white hover:bg-violet-500" : "h-10 bg-violet-600 text-white hover:bg-violet-500"}
                onClick={() => runAction(() => transferProjectOwnership({ projectId, userId: selectedTransferUserId }))}
              >
                Transfer ownership
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
