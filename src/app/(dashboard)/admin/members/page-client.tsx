"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { CheckCircle2, ShieldCheck, Users, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PasswordInput } from "@/components/ui/password-input"
import {
  removeWorkspaceMember,
  reviewSuperAdminRequest,
  revokeSuperAdmin,
  updateWorkspaceMemberCredentials,
  updateWorkspaceMemberRole,
} from "@/actions/admin-actions"
import AddMemberModal from "@/components/add-member-modal"
import type { WorkspaceRole } from "@/lib/project-membership"
import { Pencil, Plus } from "lucide-react"

interface RequestItem {
  id: string
  requested_role: string
  note: string | null
  status: string
  created_at: Date
  reviewed_at: Date | null
  review_note: string | null
  user: {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
  }
  workspace: {
    id: string
    name: string
  } | null
  reviewer: {
    full_name: string
  } | null
}

interface WorkspaceItem {
  id: string
  name: string
  members: Array<{
    id: string
    role: string
    joined_at: Date
    user: {
      id: string
      full_name: string
      email: string
      avatar_url: string | null
      is_super_admin: boolean
    }
  }>
}

function roleClasses(role: string) {
  switch (role) {
    case "admin":
      return "bg-blue-500/15 text-blue-200 border-blue-500/20"
    case "member":
      return "bg-emerald-500/15 text-emerald-200 border-emerald-500/20"
    case "owner":
      return "bg-violet-500/15 text-violet-200 border-violet-500/20"
    default:
      return "bg-white/10 text-white/60 border-white/10"
  }
}

export default function AdminMembersClient({
  workspaces,
  requests,
  isSuperAdmin,
}: {
  workspaces: WorkspaceItem[]
  requests: RequestItem[]
  isSuperAdmin: boolean
}) {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<{ workspaceId: string; userId: string; full_name: string; email: string } | null>(null)
  const [editEmail, setEditEmail] = useState("")
  const [editPassword, setEditPassword] = useState("")
  const [editError, setEditError] = useState("")

  const pendingRequests = requests.filter((request) => request.status === "pending")

  const runAction = (action: () => Promise<{ success?: boolean; error?: string }>) => {
    setMessage("")
    startTransition(async () => {
      const result = await action()
      setMessage(result.success ? "Saved successfully." : result.error || "Action failed")
      if (result.success) router.refresh()
    })
  }

  const openEdit = (workspaceId: string, membership: WorkspaceItem["members"][number]) => {
    setEditingMember({ workspaceId, userId: membership.user.id, full_name: membership.user.full_name, email: membership.user.email })
    setEditEmail(membership.user.email)
    setEditPassword("")
    setEditError("")
  }

  const handleEditSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingMember) return
    const normalizedEmail = editEmail.trim().toLowerCase()
    if (!normalizedEmail) {
      setEditError("Email is required")
      return
    }
    if (editPassword && editPassword.length < 8) {
      setEditError("Password must be at least 8 characters")
      return
    }
    const emailChanged = normalizedEmail !== editingMember.email.toLowerCase()
    const passwordChanged = editPassword.length > 0
    if (!emailChanged && !passwordChanged) {
      setEditError("Change email or provide a new password")
      return
    }
    setEditError("")
    runAction(async () => {
      const result = (await updateWorkspaceMemberCredentials({
        workspaceId: editingMember.workspaceId,
        userId: editingMember.userId,
        email: emailChanged ? normalizedEmail : undefined,
        password: passwordChanged ? editPassword : undefined,
      })) as { success?: boolean; error?: string }
      if (result.success) {
        setEditingMember(null)
        setEditPassword("")
      } else if (result.error) {
        setEditError(result.error)
      }
      return result
    })
  }

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar bg-[#18181b]">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#202023] border border-[#3f3f46] flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#f4f4f5]">{isSuperAdmin ? "Super Admin Console" : "Workspace Members"}</h1>
            <p className="text-xs text-[#a1a1aa] mt-0.5">{isSuperAdmin ? "Manage workspace members and approve elevated access requests." : "Manage members and roles in your workspaces."}</p>
          </div>
        </div>

        {message ? <div className="rounded-lg border border-[#3f3f46] bg-[#202023] px-4 py-2.5 text-xs text-[#f4f4f5]">{message}</div> : null}

        {isSuperAdmin ? <section className="rounded-xl border border-[#3f3f46] bg-[#202023] p-5 space-y-4">
          <div className="flex items-center gap-2 text-[#f4f4f5]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-semibold">Pending access requests</h2>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#3f3f46] p-6 text-xs text-[#71717a]">No pending requests.</div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-lg border border-[#3f3f46] bg-[#18181b] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-[#f4f4f5]">{request.user.full_name}</div>
                      <div className="text-xs text-[#a1a1aa]">{request.user.email}</div>
                      <div className="text-[10px] text-[#71717a] mt-0.5">
                        Requested {request.requested_role.replace(/_/g, " ")} {request.workspace ? `for ${request.workspace.name}` : ""} on {format(new Date(request.created_at), "MMM d, yyyy h:mm a")}
                      </div>
                    </div>
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300">pending</span>
                  </div>

                  {request.note ? <p className="text-xs text-[#a1a1aa]">{request.note}</p> : null}

                  <Input
                    value={reviewNote[request.id] || ""}
                    onChange={(event) => setReviewNote((current) => ({ ...current, [request.id]: event.target.value }))}
                    placeholder="Optional review note"
                    className="bg-[#202023] border-[#3f3f46] text-xs text-[#f4f4f5]"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      disabled={pending}
                      onClick={() =>
                        runAction(() =>
                          reviewSuperAdminRequest({
                            requestId: request.id,
                            decision: "approved",
                            note: reviewNote[request.id],
                          })
                        )
                      }
                      className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={pending}
                      onClick={() =>
                        runAction(() =>
                          reviewSuperAdminRequest({
                            requestId: request.id,
                            decision: "rejected",
                            note: reviewNote[request.id],
                          })
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-[#3f3f46] bg-[#202023] px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section> : null}

        <section className="rounded-xl border border-[#3f3f46] bg-[#202023] p-5 space-y-4">
          <div className="flex items-center gap-2 text-[#f4f4f5]">
            <Users className="w-4 h-4 text-[#0075de]" />
            <h2 className="text-base font-semibold">Workspace members</h2>
          </div>

          <div className="space-y-4">
            {workspaces.map((workspace) => (
              <div key={workspace.id} className="rounded-lg border border-[#3f3f46] bg-[#18181b] p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#f4f4f5]">{workspace.name}</h3>
                    <p className="text-[11px] text-[#71717a] mt-0.5">{workspace.members.length} members</p>
                  </div>
                  <button 
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#0075de] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#005bab]"
                    onClick={() => {
                      setSelectedWorkspaceId(workspace.id)
                      setIsAddModalOpen(true)
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Member
                  </button>
                </div>

                <div className="space-y-2">
                  {workspace.members.map((membership) => (
                    <div key={membership.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#3f3f46] bg-[#202023] p-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-[#f4f4f5]">{membership.user.full_name}</span>
                          {membership.user.is_super_admin ? (
                            <div className="flex items-center rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-200">
                              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                                super admin
                              </span>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  disabled={pending}
                                  title="Revoke super admin status"
                                  onClick={() => runAction(() => revokeSuperAdmin({ userId: membership.user.id }))}
                                  className="flex items-center justify-center border-l border-violet-500/20 px-1.5 hover:bg-violet-500/20 rounded-r-full transition-colors h-full"
                                >
                                  <XCircle className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-[#a1a1aa] mt-0.5">{membership.user.email}</div>
                        <div className="text-[10px] text-[#71717a] mt-0.5">Joined {format(new Date(membership.joined_at), "MMM d, yyyy")}</div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize ${roleClasses(membership.role)}`}>
                          {membership.role}
                        </span>
                          <select
                            title="Update member role"
                            value={membership.role}
                            disabled={pending || membership.role === "owner"}
                            onChange={(event) =>
                              runAction(() =>
                                updateWorkspaceMemberRole({
                                  workspaceId: workspace.id,
                                  userId: membership.user.id,
                                  role: event.target.value as Exclude<WorkspaceRole, "owner">,
                                })
                              )
                            }
                            className="rounded-md border border-[#3f3f46] bg-[#18181b] px-2.5 py-1 text-xs text-[#f4f4f5] outline-none focus:border-[#0075de]"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </select>
                          <Button
                            variant="outline"
                            disabled={pending}
                            onClick={() => openEdit(workspace.id, membership)}
                            className="rounded-md border border-[#3f3f46] bg-[#202023] px-2.5 py-1 text-xs font-semibold text-[#f4f4f5] transition-colors hover:bg-[#27272a] disabled:opacity-50"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </Button>
                           <Button
                            variant="outline"
                            disabled={pending || membership.role === "owner"}
                            onClick={() => runAction(() => removeWorkspaceMember({ workspaceId: workspace.id, userId: membership.user.id }))}
                            className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                          >
                            Remove
                          </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <AddMemberModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        workspaces={workspaces.map(w => ({ id: w.id, name: w.name }))}
        initialWorkspaceId={selectedWorkspaceId || undefined}
      />

      <Dialog open={Boolean(editingMember)} onOpenChange={(open) => { if (!open) { setEditingMember(null); setEditError("") } }}>
        <DialogContent className="border-white/10 bg-[#1e1f21] text-white sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Edit member credentials</DialogTitle>
            <p className="text-xs text-white/45">Update email and/or password for {editingMember?.full_name}. Only admins and super admins can do this.</p>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {editError ? <p className="rounded-md border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300">{editError}</p> : null}
            <label className="block space-y-1.5 text-xs">
              <span className="font-medium text-white/80">Email</span>
              <Input
                type="email"
                required
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                className="h-9 border-white/10 bg-white/5 text-xs text-white placeholder:text-white/30"
                placeholder="member@company.com"
              />
            </label>
            <label className="block space-y-1.5 text-xs">
              <span className="font-medium text-white/80">New password <span className="font-normal text-white/40">(leave blank to keep existing)</span></span>
              <PasswordInput
                value={editPassword}
                onChange={(event) => setEditPassword(event.target.value)}
                className="h-9 border-white/10 bg-white/5 text-xs text-white placeholder:text-white/30"
                placeholder="At least 8 characters"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setEditingMember(null); setEditError("") }} className="h-9 border-white/10 text-xs text-white/70 hover:bg-white/5">Cancel</Button>
              <Button type="submit" disabled={pending} className="h-9 bg-blue-600 px-5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{pending ? "Saving..." : "Save changes"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
