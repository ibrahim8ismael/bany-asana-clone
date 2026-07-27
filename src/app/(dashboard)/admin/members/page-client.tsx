"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { CheckCircle2, ShieldCheck, Users, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  removeWorkspaceMember,
  reviewSuperAdminRequest,
  updateWorkspaceMemberRole,
} from "@/actions/admin-actions"
import AddMemberModal from "@/components/add-member-modal"
import { Plus } from "lucide-react"

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
    case "owner":
      return "bg-amber-500/15 text-amber-200 border-amber-500/20"
    case "admin":
      return "bg-blue-500/15 text-blue-200 border-blue-500/20"
    case "member":
      return "bg-emerald-500/15 text-emerald-200 border-emerald-500/20"
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

  const pendingRequests = requests.filter((request) => request.status === "pending")

  const runAction = (action: () => Promise<{ success?: boolean; error?: string }>) => {
    setMessage("")
    startTransition(async () => {
      const result = await action()
      setMessage(result.success ? "Saved successfully." : result.error || "Action failed")
      if (result.success) router.refresh()
    })
  }

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar bg-[#1e1f21]">
      <div className="max-w-6xl mx-auto px-8 py-10 space-y-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-white/90">{isSuperAdmin ? "Super Admin Console" : "Workspace Members"}</h1>
            <p className="text-sm text-white/40 mt-1">{isSuperAdmin ? "Manage workspace members and approve elevated access requests." : "Manage members and roles in your workspaces."}</p>
          </div>
        </div>

        {message ? <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">{message}</div> : null}

        {isSuperAdmin ? <section className="rounded-2xl border border-white/5 bg-[#262729] p-6 space-y-5">
          <div className="flex items-center gap-2 text-white/85">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-lg font-semibold">Pending access requests</h2>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-white/35">No pending requests.</div>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-xl border border-white/5 bg-[#1f2022] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-white/85 font-medium">{request.user.full_name}</div>
                      <div className="text-sm text-white/45">{request.user.email}</div>
                      <div className="text-xs text-white/35 mt-1">
                        Requested {request.requested_role.replace(/_/g, " ")} {request.workspace ? `for ${request.workspace.name}` : ""} on {format(new Date(request.created_at), "MMM d, yyyy h:mm a")}
                      </div>
                    </div>
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">pending</span>
                  </div>

                  {request.note ? <p className="text-sm text-white/60">{request.note}</p> : null}

                  <Input
                    value={reviewNote[request.id] || ""}
                    onChange={(event) => setReviewNote((current) => ({ ...current, [request.id]: event.target.value }))}
                    placeholder="Optional review note"
                    className="bg-[#262729] border-white/10 text-white/80"
                  />

                  <div className="flex items-center gap-3">
                    <Button
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
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
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
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section> : null}

        <section className="rounded-2xl border border-white/5 bg-[#262729] p-6 space-y-5">
          <div className="flex items-center gap-2 text-white/85">
            <Users className="w-4 h-4 text-blue-400" />
            <h2 className="text-lg font-semibold">Workspace members</h2>
          </div>

          <div className="space-y-6">
            {workspaces.map((workspace) => (
              <div key={workspace.id} className="rounded-xl border border-white/5 bg-[#1f2022] p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-white/85">{workspace.name}</h3>
                    <p className="text-xs text-white/35 mt-1">{workspace.members.length} members</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 bg-white/5 border-white/10 hover:bg-white/10"
                    onClick={() => {
                      setSelectedWorkspaceId(workspace.id)
                      setIsAddModalOpen(true)
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Member
                  </Button>
                </div>

                <div className="space-y-3">
                  {workspace.members.map((membership) => (
                    <div key={membership.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/5 bg-[#262729] p-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white/85">{membership.user.full_name}</span>
                          {membership.user.is_super_admin ? (
                            <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
                              super admin
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-white/40 mt-1">{membership.user.email}</div>
                        <div className="text-xs text-white/30 mt-1">Joined {format(new Date(membership.joined_at), "MMM d, yyyy")}</div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${roleClasses(membership.role)}`}>
                          {membership.role}
                        </span>
                        {membership.role !== "owner" ? (
                          <select
                            title="Update member role"
                            defaultValue={membership.role}
                            onChange={(event) =>
                              runAction(() =>
                                updateWorkspaceMemberRole({
                                  workspaceId: workspace.id,
                                  userId: membership.user.id,
                                  role: event.target.value as "admin" | "member" | "guest",
                                })
                              )
                            }
                            className="rounded-lg border border-white/10 bg-[#1f2022] px-3 py-2 text-xs text-white/80 outline-none"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="guest">Guest</option>
                          </select>
                        ) : null}
                        {membership.role !== "owner" ? (
                          <Button
                            variant="outline"
                            disabled={pending}
                            onClick={() => runAction(() => removeWorkspaceMember({ workspaceId: workspace.id, userId: membership.user.id }))}
                          >
                            Remove
                          </Button>
                        ) : null}
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
    </div>
  )
}
