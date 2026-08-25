"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Trash2, X } from "lucide-react"
import { createClient, updateClient } from "@/actions/server-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const colors = ["#f06a6a", "#ec4899", "#9f8fef", "#14b8a6", "#84cc16", "#ef4444", "#4573d2", "#8b5cf6"]

export interface EditableClient {
  id: string
  name: string
  email?: string | null
  notes?: string | null
  color?: string | null
  archived?: boolean
  archived_at?: Date | string | null
  projectCount?: number
  directTaskCount?: number
}

export default function CreateClientModal({
  isOpen,
  onClose,
  client,
  onSuccess,
  onDeleteRequest,
}: {
  isOpen: boolean
  onClose: () => void
  client?: EditableClient | null
  onSuccess?: (client: EditableClient) => void
  onDeleteRequest?: (client: EditableClient) => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [notes, setNotes] = useState("")
  const [color, setColor] = useState(colors[0])
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()
  const isEditing = Boolean(client?.id)

  useEffect(() => {
    if (!isOpen) return

    setName(client?.name || "")
    setEmail(client?.email || "")
    setNotes(client?.notes || "")
    setColor(client?.color || colors[0])
    setDeleteConfirmationName("")
    setError("")
  }, [client, isOpen])

  if (!isOpen) return null

  const handleClose = () => {
    if (loading) return
    setError("")
    setDeleteConfirmationName("")
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError("")

    const payload = {
      name: name.trim(),
      email: email.trim(),
      notes: notes.trim(),
      color,
    }

    const result = isEditing && client
      ? await updateClient({ client_id: client.id, ...payload })
      : await createClient(payload)

    setLoading(false)

    if (result.success && result.client) {
      setName("")
      setEmail("")
      setNotes("")
      setColor(colors[0])
      onClose()

      if (onSuccess) {
        onSuccess(result.client)
      } else if (!isEditing) {
        router.push(`/clients?clientId=${result.client.id}`)
      }
      router.refresh()

      return
    }

    setError(result.error || `Failed to ${isEditing ? "update" : "create"} client. Please try again.`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => event.target === event.currentTarget && handleClose()}
    >
      <div className="flex h-dvh w-full flex-col overflow-hidden rounded-t-xl bg-[#202023] border border-[#3f3f46] shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#3f3f46] px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-lg font-semibold text-[#f4f4f5]">{isEditing ? "Edit client" : "Create new client"}</h2>
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar sm:p-6">
          <div className="space-y-1.5">
            <Label htmlFor="client-name" className="text-xs font-semibold text-[#f4f4f5]">
              Client Name *
            </Label>
            <Input
              id="client-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ahmed Trading"
              required
              autoFocus
              className="bg-[#18181b] border-[#3f3f46] text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#0075de]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-email" className="text-xs font-semibold text-[#f4f4f5]">
              Contact Email
            </Label>
            <Input
              id="client-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="client@example.com"
              className="bg-[#18181b] border-[#3f3f46] text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#0075de]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-notes" className="text-xs font-semibold text-[#f4f4f5]">
              Notes
            </Label>
            <textarea
              id="client-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Quick context about the client, scope, or contracts"
              rows={3}
              className="w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-3 py-2 text-xs text-[#f4f4f5] outline-none placeholder:text-[#a1a1aa] focus:border-[#0075de]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[#f4f4f5]">Color</Label>
            <div className="flex flex-wrap gap-2">
              {colors.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  className={`h-7 w-7 rounded-full transition-all ${color === swatch ? "scale-110 ring-2 ring-[#0075de] ring-offset-2 ring-offset-[#202023]" : "hover:scale-105"}`}
                  style={{ backgroundColor: swatch }}
                  aria-label={`Color ${swatch}`}
                />
              ))}
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          ) : null}

          {isEditing && client && onDeleteRequest ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-rose-500/20 p-2 text-rose-300">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-rose-300 uppercase tracking-wider">Danger Zone</h3>
                    <p className="mt-1 text-xs leading-5 text-rose-200/90">
                      Deleting this client permanently removes all nested work under it.
                    </p>
                    {typeof client.projectCount === "number" || typeof client.directTaskCount === "number" ? (
                      <div className="mt-1 text-[11px] font-semibold text-rose-300">
                        {client.projectCount || 0} projects and {client.directTaskCount || 0} direct tasks will be removed.
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="client-delete-confirm" className="break-words text-[10px] font-bold uppercase tracking-wide text-rose-300">
                      Type {client.name} to unlock delete
                    </Label>
                    <Input
                      id="client-delete-confirm"
                      value={deleteConfirmationName}
                      onChange={(event) => setDeleteConfirmationName(event.target.value)}
                      placeholder={client.name}
                      className="border-rose-500/30 bg-[#18181b] text-xs text-[#f4f4f5]"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={loading || deleteConfirmationName !== client.name}
                      onClick={() => onDeleteRequest(client)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Client
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#3f3f46] bg-[#202023] p-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={handleClose} disabled={loading} className="w-full rounded-md border border-[#3f3f46] bg-[#18181b] px-4 py-1.5 text-xs font-semibold text-[#f4f4f5] transition-colors hover:bg-[#27272a] sm:w-auto">
              Cancel
            </button>
            <button type="submit" disabled={loading || !name.trim()} className="w-full rounded-full bg-[#0075de] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#005bab] disabled:opacity-50 sm:w-auto">
              {loading ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Client")}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
