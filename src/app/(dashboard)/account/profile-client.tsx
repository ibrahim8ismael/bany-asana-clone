"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { format } from "date-fns"
import { ShieldCheck, Mail, UserCircle2, KeyRound, LogOut, Upload, Briefcase } from "lucide-react"
import { submitSuperAdminRequest } from "@/actions/admin-actions"
import { updateCurrentUserPassword, updateCurrentUserProfile } from "@/actions/account-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface AccountUser {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  is_super_admin: boolean
  timezone: string | null
  created_at: Date
  _count: {
    tasks_assigned: number
    tasks_created: number
    comments: number
  }
  workspaces: Array<{
    role: string
    joined_at: Date
    workspace: {
      id: string
      name: string
      slug: string
    }
  }>
  access_requests: Array<{
    id: string
    requested_role: string
    status: string
    note: string | null
    review_note: string | null
    created_at: Date
    workspace: {
      id: string
      name: string
    } | null
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

export default function AccountClient({ user, canImport }: { user: AccountUser; canImport: boolean }) {
  const router = useRouter()
  const { update: updateSession } = useSession()
  const [profileMessage, setProfileMessage] = useState("")
  const [avatarMessage, setAvatarMessage] = useState("")
  const [passwordMessage, setPasswordMessage] = useState("")
  const [accessMessage, setAccessMessage] = useState("")
  const [profilePending, startProfileTransition] = useTransition()
  const [passwordPending, startPasswordTransition] = useTransition()
  const [accessPending, startAccessTransition] = useTransition()
  const [fullName, setFullName] = useState(user.full_name)
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || "")
  const [avatarPreview, setAvatarPreview] = useState(user.avatar_url || "")
  const [avatarPending, setAvatarPending] = useState(false)
  const [timezone, setTimezone] = useState(user.timezone || "")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")

  const primaryMembership = user.workspaces[0]
  const latestRequest = user.access_requests[0]

  useEffect(() => {
    if (!avatarPreview.startsWith("blob:")) return
    return () => URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

  async function uploadAvatar(file: File) {
    setAvatarMessage("")

    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setAvatarMessage("Choose a JPEG, PNG, WebP, or GIF image.")
      return
    }
    if (file.size === 0 || file.size > 2 * 1024 * 1024) {
      setAvatarMessage("Avatar must be 2MB or smaller.")
      return
    }

    setAvatarPreview(URL.createObjectURL(file))
    setAvatarPending(true)

    try {
      const formData = new FormData()
      formData.set("avatar", file)
      const response = await fetch("/api/account/avatar", { method: "POST", body: formData })
      const result = await response.json().catch(() => ({})) as { avatarUrl?: string; error?: string }
      if (!response.ok || !result.avatarUrl) {
        throw new Error(result.error || "Avatar upload failed")
      }

      setAvatarUrl(result.avatarUrl)
      setAvatarPreview(result.avatarUrl)
      setAvatarMessage("Avatar updated successfully.")
      await updateSession()
      router.refresh()
    } catch (error) {
      setAvatarPreview(avatarUrl)
      setAvatarMessage(error instanceof Error ? error.message : "Avatar upload failed")
    } finally {
      setAvatarPending(false)
    }
  }

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar bg-[#18181b]">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 overflow-hidden rounded-full border border-[#3f3f46] bg-[#202023] flex items-center justify-center text-[#f4f4f5] text-lg font-bold shadow-sm">
              {avatarPreview ? (
                <img src={avatarPreview} alt={fullName || user.full_name} className="h-full w-full object-cover" />
              ) : (
                (fullName || user.full_name).charAt(0)
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#f4f4f5]">Account</h1>
              <p className="text-xs text-[#a1a1aa] mt-0.5">Manage your profile, workspace roles, and import access.</p>
            </div>
          </div>

          <button
            onClick={() => void signOut({ callbackUrl: "/login" })}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#3f3f46] bg-[#202023] px-3 text-xs font-semibold text-[#f4f4f5] transition-colors hover:bg-[#27272a]"
          >
            <LogOut className="w-3.5 h-3.5 text-[#a1a1aa]" />
            Sign out
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-xl border border-[#3f3f46] bg-[#202023] p-5 space-y-4">
            <div className="flex items-center gap-2 text-[#f4f4f5]">
              <UserCircle2 className="w-4 h-4 text-[#0075de]" />
              <h2 className="text-base font-semibold">Profile details</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#a1a1aa]">Full name</label>
                <Input value={fullName} maxLength={100} onChange={(event) => setFullName(event.target.value)} className="bg-[#18181b] border-[#3f3f46] text-xs text-[#f4f4f5] focus:border-[#0075de]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#a1a1aa]">Email</label>
                <Input value={user.email} readOnly className="bg-[#18181b] border-[#3f3f46] text-xs text-[#71717a]" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="avatar-upload" className="text-xs font-semibold text-[#a1a1aa]">Profile image</label>
                <div className="flex items-center gap-4 rounded-lg border border-[#3f3f46] bg-[#18181b] p-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#3f3f46] bg-[#202023] flex items-center justify-center text-sm font-bold text-[#f4f4f5]">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                    ) : (
                      (fullName || user.full_name).charAt(0)
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Input
                      id="avatar-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={avatarPending}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void uploadAvatar(file)
                        event.target.value = ""
                      }}
                      className="bg-[#202023] border-[#3f3f46] text-xs text-[#a1a1aa] file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-semibold file:text-[#0075de]"
                    />
                    <p className="text-[10px] text-[#71717a]">JPEG, PNG, WebP, or GIF. Maximum 2MB.</p>
                  </div>
                </div>
                {avatarMessage ? <p className="text-xs text-[#a1a1aa]" aria-live="polite">{avatarMessage}</p> : null}
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-[#a1a1aa]">Or use an image URL</label>
                <Input
                  value={avatarUrl}
                  onChange={(event) => {
                    setAvatarUrl(event.target.value)
                    setAvatarPreview(event.target.value.trim())
                  }}
                  className="bg-[#18181b] border-[#3f3f46] text-xs text-[#f4f4f5] focus:border-[#0075de]"
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-[#a1a1aa]">Timezone</label>
                <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="bg-[#18181b] border-[#3f3f46] text-xs text-[#f4f4f5] focus:border-[#0075de]" placeholder="Africa/Cairo" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setProfileMessage("")
                  startProfileTransition(async () => {
                    const result = await updateCurrentUserProfile({ fullName, avatarUrl, timezone })
                    setProfileMessage(result.success ? "Profile updated successfully." : result.error || "Profile update failed")
                    if (result.success) {
                      await updateSession()
                      router.refresh()
                    }
                  })
                }}
                disabled={profilePending || avatarPending}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0075de] px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#005bab] disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {profilePending ? "Saving..." : "Save profile"}
              </button>
              {profileMessage ? <p className="text-xs text-[#a1a1aa]" aria-live="polite">{profileMessage}</p> : null}
            </div>
          </section>

          <section className="rounded-xl border border-[#3f3f46] bg-[#202023] p-5 space-y-4">
            <div className="flex items-center gap-2 text-[#f4f4f5]">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-semibold">Access and status</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[#3f3f46] bg-[#18181b] p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#71717a]">Assigned tasks</div>
                <div className="text-xl font-bold text-[#f4f4f5] mt-1">{user._count.tasks_assigned}</div>
              </div>
              <div className="rounded-lg border border-[#3f3f46] bg-[#18181b] p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#71717a]">Created tasks</div>
                <div className="text-xl font-bold text-[#f4f4f5] mt-1">{user._count.tasks_created}</div>
              </div>
              <div className="rounded-lg border border-[#3f3f46] bg-[#18181b] p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#71717a]">Comments</div>
                <div className="text-xl font-bold text-[#f4f4f5] mt-1">{user._count.comments}</div>
              </div>
            </div>

            <div className="rounded-lg border border-[#3f3f46] bg-[#18181b] p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs text-[#a1a1aa]">
                <Mail className="w-3.5 h-3.5 text-[#0075de]" />
                Member since {format(new Date(user.created_at), "MMM d, yyyy")}
              </div>
              <div className="flex items-center gap-2 text-xs text-[#a1a1aa]">
                <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                Primary workspace: {primaryMembership?.workspace.name || "No workspace"}
              </div>
              <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${canImport ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-[#3f3f46] bg-[#202023] text-[#a1a1aa]"}`}>
                {canImport ? "Import access enabled" : "Import access not available on this account"}
              </div>
              {user.is_super_admin ? (
                <Link href="/admin/members" className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-violet-300 hover:bg-violet-500/20 transition-colors">
                  Open super admin console
                </Link>
              ) : null}
            </div>

            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Workspace roles</h3>
              {user.workspaces.map((membership) => (
                <div key={`${membership.workspace.id}-${membership.role}`} className="flex items-center justify-between gap-4 rounded-lg border border-[#3f3f46] bg-[#18181b] p-3">
                  <div>
                    <div className="text-xs font-semibold text-[#f4f4f5]">{membership.workspace.name}</div>
                    <div className="text-[10px] text-[#71717a] mt-0.5">Joined {format(new Date(membership.joined_at), "MMM d, yyyy")}</div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize ${roleClasses(membership.role)}`}>
                    {membership.role}
                  </span>
                </div>
              ))}
            </div>

            {!user.is_super_admin ? (
              <div className="rounded-lg border border-[#3f3f46] bg-[#18181b] p-3.5 space-y-2.5">
                <div>
                  <h3 className="text-xs font-semibold text-[#f4f4f5]">Request elevated access</h3>
                  <p className="text-[11px] text-[#a1a1aa] mt-0.5">Request super admin access only if you need global administration or protected import access.</p>
                </div>

                {latestRequest ? (
                  <div className="rounded-md border border-[#3f3f46] bg-[#202023] p-2.5 text-xs text-[#a1a1aa] space-y-1">
                    <div>
                      Latest request: <span className="font-semibold text-[#f4f4f5]">{latestRequest.status}</span>
                    </div>
                    <div className="text-[10px] text-[#71717a]">
                      {latestRequest.workspace ? `${latestRequest.workspace.name} - ` : ""}
                      {format(new Date(latestRequest.created_at), "MMM d, yyyy h:mm a")}
                    </div>
                    {latestRequest.review_note ? <div className="text-[10px] text-[#a1a1aa]">Review note: {latestRequest.review_note}</div> : null}
                  </div>
                ) : null}

                <div className="flex items-center gap-3">
                  <button
                    disabled={accessPending || latestRequest?.status === "pending"}
                    onClick={() => {
                      setAccessMessage("")
                      startAccessTransition(async () => {
                        const result = await submitSuperAdminRequest({ workspaceId: primaryMembership?.workspace.id || null })
                        setAccessMessage(result.success ? "Access request submitted." : result.error || "Could not submit request")
                        if (result.success) router.refresh()
                      })
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#3f3f46] bg-[#202023] px-3 text-xs font-semibold text-[#f4f4f5] transition-colors hover:bg-[#27272a] disabled:opacity-50"
                  >
                    {accessPending ? "Submitting..." : latestRequest?.status === "pending" ? "Request pending" : "Request super admin access"}
                  </button>
                  {accessMessage ? <p className="text-xs text-[#a1a1aa]">{accessMessage}</p> : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <section className="rounded-xl border border-[#3f3f46] bg-[#202023] p-5 space-y-4">
          <div className="flex items-center gap-2 text-[#f4f4f5]">
            <KeyRound className="w-4 h-4 text-violet-400" />
            <h2 className="text-base font-semibold">Security</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#a1a1aa]">Current password</label>
              <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="bg-[#18181b] border-[#3f3f46] text-xs text-[#f4f4f5] focus:border-[#0075de]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#a1a1aa]">New password</label>
              <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="bg-[#18181b] border-[#3f3f46] text-xs text-[#f4f4f5] focus:border-[#0075de]" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setPasswordMessage("")
                startPasswordTransition(async () => {
                  const result = await updateCurrentUserPassword({ currentPassword, newPassword })
                  if (result.success) {
                    setCurrentPassword("")
                    setNewPassword("")
                    router.refresh()
                  }
                  setPasswordMessage(result.success ? "Password updated successfully." : result.error || "Password update failed")
                })
              }}
              disabled={passwordPending || !currentPassword || !newPassword}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#3f3f46] bg-[#18181b] px-3 text-xs font-semibold text-[#f4f4f5] transition-colors hover:bg-[#27272a] disabled:opacity-50"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#a1a1aa]" />
              {passwordPending ? "Updating..." : "Update password"}
            </button>
            {passwordMessage ? <p className="text-xs text-[#a1a1aa]">{passwordMessage}</p> : null}
          </div>
        </section>
      </div>
    </div>
  )
}
