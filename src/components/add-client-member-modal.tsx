"use client"

import { useEffect, useState } from "react"
import { getWorkspaceMembers } from "@/actions/server-actions"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, UserPlus, X, Trash2 } from "lucide-react"

export type ClientMember = {
  id: string
  full_name: string
  email: string
  avatar_url?: string | null
  role: string
}

interface AddClientMemberModalProps {
  isOpen: boolean
  onClose: () => void
  clientName: string
  clientId: string
  currentMembers?: ClientMember[]
  onMembersUpdated?: (members: ClientMember[]) => void
}

const ROLES = [
  { id: "lead", label: "Account Lead", description: "Full control over client projects and task assignments" },
  { id: "member", label: "Member", description: "Can view and work on assigned client projects" },
  { id: "viewer", label: "Viewer", description: "Read-only access to client progress and updates" },
]

export default function AddClientMemberModal({
  isOpen,
  onClose,
  clientName,
  clientId,
  currentMembers = [],
  onMembersUpdated,
}: AddClientMemberModalProps) {
  const [users, setUsers] = useState<{ id: string; full_name: string; email: string; avatar_url?: string | null }[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedRole, setSelectedRole] = useState("member")
  const [membersList, setMembersList] = useState<ClientMember[]>(currentMembers)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setMembersList(currentMembers)
    
    async function fetchUsers() {
      setLoadingUsers(true)
      const res = await getWorkspaceMembers()
      if (res.success && res.users) {
        setUsers(res.users)
      }
      setLoadingUsers(false)
    }
    fetchUsers()
  }, [isOpen, currentMembers])

  if (!isOpen) return null

  const availableUsers = users.filter(u => !membersList.some(m => m.id === u.id))

  const handleAddMember = () => {
    if (!selectedUserId) return
    const user = users.find(u => u.id === selectedUserId)
    if (!user) return

    const newMember: ClientMember = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      avatar_url: user.avatar_url,
      role: selectedRole,
    }

    const updated = [...membersList, newMember]
    setMembersList(updated)
    setSelectedUserId("")
    if (onMembersUpdated) onMembersUpdated(updated)
  }

  const handleRemoveMember = (userId: string) => {
    const updated = membersList.filter(m => m.id !== userId)
    setMembersList(updated)
    if (onMembersUpdated) onMembersUpdated(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#3f3f46] bg-[#202023] text-[#f4f4f5] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3f3f46] px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0075de]/20 text-[#0075de]">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#f4f4f5]">Manage Client Team</h2>
              <p className="text-xs text-[#a1a1aa]">{clientName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#f4f4f5]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Add Form */}
          <div className="space-y-4 rounded-xl border border-[#3f3f46] bg-[#18181b] p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Add Team Member</h3>
            
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-[#f4f4f5]">Select Person</Label>
                {loadingUsers ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-[#a1a1aa]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0075de]" />
                    Loading workspace members...
                  </div>
                ) : (
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="mt-1.5 w-full rounded-md border border-[#3f3f46] bg-[#202023] px-3 py-2 text-xs text-[#f4f4f5] focus:border-[#0075de] focus:outline-none"
                  >
                    <option value="">-- Choose a team member --</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#f4f4f5]">Role</Label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRole(r.id)}
                      className={`rounded-lg border p-2.5 text-left transition-colors ${
                        selectedRole === r.id
                          ? "border-[#0075de] bg-[#0075de]/10 text-white"
                          : "border-[#3f3f46] bg-[#202023] text-[#a1a1aa] hover:border-[#52525c]"
                      }`}
                    >
                      <div className="text-xs font-bold">{r.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                disabled={!selectedUserId}
                onClick={handleAddMember}
                className="w-full h-9 rounded-full bg-[#0075de] text-xs font-semibold text-white hover:bg-[#005bab] disabled:opacity-40"
              >
                Add to Client
              </Button>
            </div>
          </div>

          {/* Current Members List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">
              Client Members ({membersList.length})
            </h3>

            {membersList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#3f3f46] p-4 text-center text-xs text-[#a1a1aa]">
                No specific team members assigned to this client yet.
              </div>
            ) : (
              <div className="space-y-2">
                {membersList.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-[#3f3f46] bg-[#18181b] p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0075de]/20 text-xs font-bold text-[#60a5fa]">
                        {m.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#f4f4f5]">{m.full_name}</div>
                        <div className="text-[11px] text-[#a1a1aa]">{m.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-[#0075de]/30 bg-[#0075de]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#60a5fa]">
                        {m.role}
                      </span>
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#a1a1aa] hover:bg-rose-500/20 hover:text-rose-400"
                        title="Remove member"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[#3f3f46] bg-[#18181b] px-6 py-3">
          <Button
            type="button"
            onClick={onClose}
            className="h-8 rounded-full bg-[#0075de] px-5 text-xs font-semibold text-white hover:bg-[#005bab]"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
