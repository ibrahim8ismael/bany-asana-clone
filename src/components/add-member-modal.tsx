"use client"

import { useState } from "react"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addWorkspaceMember } from "@/actions/admin-actions"

interface AddMemberModalProps {
  isOpen: boolean
  onClose: () => void
  workspaces: Array<{ id: string; name: string }>
  initialWorkspaceId?: string
}

export default function AddMemberModal({ isOpen, onClose, workspaces, initialWorkspaceId }: AddMemberModalProps) {
  const preferredWorkspaceId = workspaces.some((workspace) => workspace.id === initialWorkspaceId)
    ? initialWorkspaceId || ""
    : workspaces[0]?.id || ""
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [previousIsOpen, setPreviousIsOpen] = useState(isOpen)
  
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "member" as "admin" | "member" | "guest",
    workspaceId: preferredWorkspaceId,
  })

  if (isOpen !== previousIsOpen) {
    setPreviousIsOpen(isOpen)
    if (isOpen) {
      setError("")
      setFormData((current) => ({ ...current, workspaceId: preferredWorkspaceId }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const result = await addWorkspaceMember(formData)
    
    setLoading(false)
    if ("success" in result && result.success) {
      onClose()
      setFormData({
        fullName: "",
        email: "",
        password: "",
        role: "member",
        workspaceId: preferredWorkspaceId,
      })
    } else {
      setError(result.error || "Failed to add user")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-[425px] bg-[#1e1f21] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Add New Member</DialogTitle>
          <p className="text-sm text-white/40">Create a new user or add an existing user to a workspace.</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              required
              placeholder="Alice Admin"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="bg-white/5 border-white/10 focus:border-blue-500 h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              required
              placeholder="alice@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="bg-white/5 border-white/10 focus:border-blue-500 h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Initial Password (Optional)</Label>
            <Input
              id="password"
              type="password"
              placeholder="Leave blank for random"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="bg-white/5 border-white/10 focus:border-blue-500 h-10"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                title="Select user role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as "admin" | "member" | "guest" })}
                className="h-10 w-full rounded-md border border-white/10 bg-[#252628] px-3 text-sm text-white outline-none [color-scheme:dark] focus:border-blue-500"
              >
                <option className="bg-[#252628] text-white" value="member">Member</option>
                <option className="bg-[#252628] text-white" value="admin">Admin</option>
                <option className="bg-[#252628] text-white" value="guest">Guest</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace">Workspace</Label>
              <select
                id="workspace"
                title="Select workspace"
                value={formData.workspaceId}
                onChange={(e) => setFormData({ ...formData, workspaceId: e.target.value })}
                className="h-10 w-full rounded-md border border-white/10 bg-[#252628] px-3 text-sm text-white outline-none [color-scheme:dark] focus:border-blue-500"
              >
                {workspaces.map((w) => (
                  <option className="bg-[#252628] text-white" key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              className="border-white/10 text-white/70 hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
            >
              {loading ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
