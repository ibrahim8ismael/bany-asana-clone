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
      } else if (isEditing) {
        router.refresh()
      } else {
        router.push(`/clients?clientId=${result.client.id}`)
        router.refresh()
      }

      return
    }

    setError(result.error || `Failed to ${isEditing ? "update" : "create"} client. Please try again.`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => event.target === event.currentTarget && handleClose()}
    >
      <div className="flex h-dvh w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl ring-1 ring-gray-200 dark:bg-zinc-950 dark:ring-zinc-800 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-xl">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 dark:border-zinc-800 sm:px-6 sm:py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{isEditing ? "Edit client" : "Create new client"}</h2>
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 custom-scrollbar sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="client-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Client Name *
            </Label>
            <Input
              id="client-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ahmed Trading"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Contact Email
            </Label>
            <Input
              id="client-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="client@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-notes" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </Label>
            <textarea
              id="client-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Quick context about the client, scope, or contracts"
              rows={3}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none ring-blue-500/30 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-200"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Color</Label>
            <div className="flex flex-wrap gap-2">
              {colors.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  className={`h-7 w-7 rounded-full transition-all ${color === swatch ? "scale-110 ring-2 ring-gray-400 ring-offset-2" : "hover:scale-105"}`}
                  style={{ backgroundColor: swatch }}
                  aria-label={`Color ${swatch}`}
                />
              ))}
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          ) : null}

          {isEditing && client && onDeleteRequest ? (
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-900/60 dark:bg-red-950/20">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-red-100 p-2 text-red-600 dark:bg-red-900/40 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">Danger Zone</h3>
                    <p className="mt-1 text-sm leading-6 text-red-700/90 dark:text-red-300/85">
                      Deleting this client permanently removes all nested work under it.
                    </p>
                    {typeof client.projectCount === "number" || typeof client.directTaskCount === "number" ? (
                      <div className="mt-2 text-xs text-red-700/80 dark:text-red-300/80">
                        {client.projectCount || 0} projects and {client.directTaskCount || 0} direct tasks will be removed.
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="client-delete-confirm" className="break-words text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                      Type {client.name} to unlock delete
                    </Label>
                    <Input
                      id="client-delete-confirm"
                      value={deleteConfirmationName}
                      onChange={(event) => setDeleteConfirmationName(event.target.value)}
                      placeholder={client.name}
                      className="border-red-200 bg-white/90 dark:border-red-900/60 dark:bg-zinc-900"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={loading || deleteConfirmationName !== client.name}
                      onClick={() => onDeleteRequest(client)}
                      className="inline-flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Client
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={loading} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()} className="w-full sm:w-auto">
              {loading ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Client")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
