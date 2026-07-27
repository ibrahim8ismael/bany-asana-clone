"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart2,
  Bell,
  Briefcase,
  Check,
  CheckCircle,
  ChevronDown,
  FolderKanban,
  Home,
  LifeBuoy,
  Menu,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Star,
  Target,
  Upload,
  UserPlus,
  X,
} from "lucide-react"
import { createWorkspace, renameWorkspace, switchWorkspace } from "@/actions/workspace-actions"
import AddMemberModal from "./add-member-modal"
import CreateClientModal from "./create-client-modal"
import CreateProjectModal from "./create-project-modal"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const SIDEBAR_EXPANDED_CLIENTS_STORAGE_KEY = "sidebar-expanded-clients-v1"

interface SidebarProject {
  id: string
  name: string
  color: string | null
  default_view: string
}

interface SidebarClient {
  id: string
  name: string
  color: string | null
  directTaskCount: number
  projects: SidebarProject[]
}

interface SidebarWorkspace {
  id: string
  name: string
  slug: string
  role: string
  effectiveRole: string
  canAdmin: boolean
}

interface StarredProject extends SidebarProject {
  client?: {
    id: string
    name: string
  } | null
}

export default function Sidebar({
  workspace,
  workspaces = [],
  clients = [],
  starredProjects = [],
  canImport = false,
  isSuperAdmin = false,
  myTasksBadgeCount = 0,
}: {
  workspace?: SidebarWorkspace | null
  workspaces?: SidebarWorkspace[]
  clients?: SidebarClient[]
  starredProjects?: StarredProject[]
  canImport?: boolean
  isSuperAdmin?: boolean
  myTasksBadgeCount?: number
}) {
  const pathname = usePathname()
  const router = useRouter()
  const workspaceMenuRef = useRef<HTMLDivElement>(null)
  const [workspacePending, startWorkspaceTransition] = useTransition()
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false)
  const [isClientModalOpen, setIsClientModalOpen] = useState(false)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false)
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false)
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false)
  const [isRenameWorkspaceOpen, setIsRenameWorkspaceOpen] = useState(false)
  const [workspaceName, setWorkspaceName] = useState("")
  const [renameName, setRenameName] = useState(workspace?.name || "")
  const [workspaceError, setWorkspaceError] = useState("")
  const [clientsExpanded, setClientsExpanded] = useState(true)
  const [insightsExpanded, setInsightsExpanded] = useState(true)
  const [starredExpanded, setStarredExpanded] = useState(true)
  const [expandedClientIds, setExpandedClientIds] = useState<Set<string>>(new Set())
  const [hasLoadedExpandedState, setHasLoadedExpandedState] = useState(false)

  const projectClientOptions = useMemo(
    () => clients.map((client) => ({ id: client.id, name: client.name, color: client.color })),
    [clients]
  )

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(SIDEBAR_EXPANDED_CLIENTS_STORAGE_KEY)

      if (!rawValue) {
        setExpandedClientIds(new Set(clients.map((client) => client.id)))
        setHasLoadedExpandedState(true)
        return
      }

      const parsedValue = JSON.parse(rawValue)
      const validClientIds = new Set(clients.map((client) => client.id))
      const expandedIds = Array.isArray(parsedValue)
        ? parsedValue.filter((value): value is string => typeof value === "string" && validClientIds.has(value))
        : []

      setExpandedClientIds(new Set(expandedIds))
    } catch {
      setExpandedClientIds(new Set(clients.map((client) => client.id)))
    } finally {
      setHasLoadedExpandedState(true)
    }
  }, [clients])

  useEffect(() => {
    if (!hasLoadedExpandedState) return

    window.localStorage.setItem(
      SIDEBAR_EXPANDED_CLIENTS_STORAGE_KEY,
      JSON.stringify(Array.from(expandedClientIds))
    )
  }, [expandedClientIds, hasLoadedExpandedState])

  useEffect(() => {
    const openMobileMenu = () => setIsMobileMenuOpen(true)
    window.addEventListener("taskflow:open-mobile-sidebar", openMobileMenu)
    return () => {
      window.removeEventListener("taskflow:open-mobile-sidebar", openMobileMenu)
    }
  }, [])

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!isMobileMenuOpen) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false)
    }

    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isMobileMenuOpen])

  useEffect(() => {
    if (!isWorkspaceMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!workspaceMenuRef.current?.contains(event.target as Node)) setIsWorkspaceMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsWorkspaceMenuOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isWorkspaceMenuOpen])

  const handleWorkspaceSwitch = (workspaceId: string) => {
    setWorkspaceError("")
    if (workspaceId === workspace?.id) {
      setIsWorkspaceMenuOpen(false)
      return
    }

    startWorkspaceTransition(async () => {
      const result = await switchWorkspace({ workspaceId })
      if (result.error) {
        setWorkspaceError(result.error)
        return
      }

      setIsWorkspaceMenuOpen(false)
      router.push("/home")
      router.refresh()
    })
  }

  const handleCreateWorkspace = (event: React.FormEvent) => {
    event.preventDefault()
    setWorkspaceError("")
    startWorkspaceTransition(async () => {
      const result = await createWorkspace({ name: workspaceName })
      if (result.error) {
        setWorkspaceError(result.error)
        return
      }

      setWorkspaceName("")
      setIsCreateWorkspaceOpen(false)
      router.push("/home")
      router.refresh()
    })
  }

  const handleRenameWorkspace = (event: React.FormEvent) => {
    event.preventDefault()
    if (!workspace) return
    setWorkspaceError("")
    startWorkspaceTransition(async () => {
      const result = await renameWorkspace({ workspaceId: workspace.id, name: renameName })
      if (result.error) {
        setWorkspaceError(result.error)
        return
      }

      setIsRenameWorkspaceOpen(false)
      router.refresh()
    })
  }

  const primaryLinks = [
    { name: "Home", href: "/home", icon: Home, badge: 0 },
    { name: "My Tasks", href: "/my-tasks", icon: CheckCircle, badge: myTasksBadgeCount },
    { name: "Inbox", href: "/inbox", icon: Bell, badge: 0 },
  ]

  const insightLinks = [
    { name: "KPI Dashboard", href: "/reporting", icon: BarChart2 },
    { name: "Clients", href: "/clients", icon: Briefcase },
    { name: "Goals", href: "/goals", icon: Target },
  ]

  const isActive = (href: string) => pathname?.startsWith(href)

  const toggleClient = (clientId: string) => {
    setExpandedClientIds((previous) => {
      const next = new Set(previous)
      if (next.has(clientId)) {
        next.delete(clientId)
      } else {
        next.add(clientId)
      }
      return next
    })
  }

  return (
    <>
      {isMobileMenuOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      ) : null}

      <aside
        id="mobile-sidebar"
        aria-label="Primary navigation"
        className={`shrink-0 flex-col border-r border-[#414245] bg-[#2a2b2d] ${
          isMobileMenuOpen
            ? "fixed inset-y-0 left-0 z-50 flex w-[min(88vw,320px)] shadow-2xl shadow-black/60"
            : "hidden"
        } lg:static lg:z-auto lg:flex lg:w-[260px] lg:shadow-none`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#3d3e41] px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Menu className="hidden h-5 w-5 shrink-0 text-white/65 lg:block" />
            <div className="relative h-7 w-7 shrink-0" aria-hidden="true">
              <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#f06a6a]" />
              <span className="absolute bottom-0 left-0 h-2.5 w-2.5 rounded-full bg-[#f06a6a]" />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#f06a6a]" />
            </div>
            <span className="truncate text-lg font-semibold tracking-[-0.03em] text-white">TaskFlow</span>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-white/65 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3 custom-scrollbar">
          <div className="relative mb-3">
            <button
              onClick={() => setIsCreateMenuOpen((current) => !current)}
              className="group flex h-10 items-center gap-2 rounded-full border border-[#5a5b5e] bg-[#343537] px-3 text-sm font-semibold text-white/90 transition-colors hover:bg-[#3b3c3f]"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f06a6a]">
                <Plus className="h-3.5 w-3.5 text-white" />
              </div>
              Create
            </button>

            {isCreateMenuOpen ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-lg border border-[#55565a] bg-[#343537] p-1.5 shadow-2xl">
                <button
                  onClick={() => {
                    setIsCreateMenuOpen(false)
                    setIsClientModalOpen(true)
                  }}
                  className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-white/75 transition-colors hover:bg-[#454649] hover:text-white"
                >
                  <Briefcase className="h-4 w-4 text-[#f06a6a]" />
                  New client
                </button>
                <button
                  onClick={() => {
                    setIsCreateMenuOpen(false)
                    setIsProjectModalOpen(true)
                  }}
                  className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-white/75 transition-colors hover:bg-[#454649] hover:text-white"
                >
                  <FolderKanban className="h-4 w-4 text-blue-400" />
                  New project
                </button>
              </div>
            ) : null}
          </div>

          <div ref={workspaceMenuRef} className="relative mb-2">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isWorkspaceMenuOpen}
              onClick={() => {
                setWorkspaceError("")
                setIsWorkspaceMenuOpen((current) => !current)
              }}
              className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-white/60 transition-colors hover:bg-[#36373a] hover:text-white"
            >
              <span className="truncate">{workspace?.name || "Choose a workspace"}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isWorkspaceMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {isWorkspaceMenuOpen ? (
              <div role="menu" aria-label="Workspaces" className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-[#55565a] bg-[#343537] p-1.5 shadow-2xl">
                <div className="max-h-56 overflow-y-auto custom-scrollbar">
                  {workspaces.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={item.id === workspace?.id}
                      disabled={workspacePending}
                      onClick={() => handleWorkspaceSwitch(item.id)}
                      className="flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-white/80 transition-colors hover:bg-[#454649] disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.name}</span>
                        <span className="block truncate text-[10px] capitalize text-white/35">{item.effectiveRole}</span>
                      </span>
                      {item.id === workspace?.id ? <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-label="Active" /> : null}
                    </button>
                  ))}
                </div>

                <div className="mt-1 border-t border-white/10 pt-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsWorkspaceMenuOpen(false)
                      setWorkspaceError("")
                      setIsCreateWorkspaceOpen(true)
                    }}
                    className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-white/70 transition-colors hover:bg-[#454649] hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create workspace
                  </button>
                  {workspace?.canAdmin ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setRenameName(workspace.name)
                        setIsWorkspaceMenuOpen(false)
                        setWorkspaceError("")
                        setIsRenameWorkspaceOpen(true)
                      }}
                      className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-white/70 transition-colors hover:bg-[#454649] hover:text-white"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Rename current workspace
                    </button>
                  ) : null}
                  {workspace?.canAdmin ? (
                    <Link
                      href="/admin/members"
                      role="menuitem"
                      onClick={() => setIsWorkspaceMenuOpen(false)}
                      className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-white/70 transition-colors hover:bg-[#454649] hover:text-white"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Manage members
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
            {workspaceError && isWorkspaceMenuOpen ? <p className="px-3 pt-1 text-xs text-red-300">{workspaceError}</p> : null}
          </div>

          <ul className="space-y-0.5">
            {primaryLinks.map((link) => (
              <li key={link.name}>
                <Link
                  href={link.href}
                  className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors ${
                    isActive(link.href)
                      ? "bg-[#454649] font-semibold text-white"
                      : "text-white/75 hover:bg-[#36373a] hover:text-white"
                  }`}
                >
                   <link.icon className="h-[18px] w-[18px] text-white/60" />
                   {link.name}
                   {link.badge > 0 ? <span className="ml-auto rounded-full bg-[#f06a6a] px-2 py-0.5 text-[10px] font-bold text-white">{link.badge > 99 ? "99+" : link.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>

          <div className="pt-5">
            <button
              onClick={() => setInsightsExpanded((current) => !current)}
              className="mb-1 flex h-8 w-full items-center gap-1.5 px-3 text-[13px] font-semibold text-white/80 transition-colors hover:text-white"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${insightsExpanded ? "" : "-rotate-90"}`} />
              Insights
            </button>
            {insightsExpanded ? (
              <ul className="space-y-0.5">
                {insightLinks.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors ${
                        isActive(link.href)
                          ? "bg-[#454649] font-semibold text-white"
                          : "text-white/75 hover:bg-[#36373a] hover:text-white"
                      }`}
                    >
                      <link.icon className="h-4 w-4" />
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="pt-5">
            <button
              onClick={() => setStarredExpanded((current) => !current)}
              className="mb-1 flex h-8 w-full items-center gap-1.5 px-3 text-[13px] font-semibold text-white/80 transition-colors hover:text-white"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${starredExpanded ? "" : "-rotate-90"}`} />
              Starred
            </button>
            {starredExpanded ? (
              <div className="px-1">
                {starredProjects.length > 0 ? (
                  <ul className="space-y-0.5">
                    {starredProjects.map((project) => {
                      const href = `/projects/${project.id}/${project.default_view}`
                      return (
                        <li key={project.id}>
                          <Link
                            href={href}
                            className={`flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                              pathname?.includes(project.id)
                                ? "bg-[#454649] font-semibold text-white"
                                : "text-white/70 hover:bg-[#36373a] hover:text-white"
                            }`}
                          >
                            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{project.name}</div>
                              {project.client?.name ? <div className="truncate text-[11px] text-white/30">{project.client.name}</div> : null}
                            </div>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="px-3 py-2 text-xs italic text-white/30">No starred items</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="pb-8 pt-5">
            <div className="group mb-1 flex items-center justify-between px-3">
              <button
                onClick={() => setClientsExpanded((current) => !current)}
                className="flex h-8 items-center gap-1.5 text-[13px] font-semibold text-white/80 transition-colors hover:text-white"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${clientsExpanded ? "" : "-rotate-90"}`} />
                Clients
              </button>
              <button
                onClick={() => setIsClientModalOpen(true)}
                className="rounded p-1 transition-opacity hover:bg-white/10"
                aria-label="Create new client"
              >
                <Plus className="h-3.5 w-3.5 text-white/40" />
              </button>
            </div>

            {clientsExpanded ? (
              <ul className="space-y-1">
                {clients.map((client) => {
                  const clientExpanded = expandedClientIds.has(client.id)
                  const directTasksHref = `/clients?clientId=${client.id}`

                  return (
                    <li key={client.id} className="space-y-1">
                      <div className="flex items-center gap-1 px-2">
                        <button
                          onClick={() => toggleClient(client.id)}
                          className="rounded p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
                          aria-label={`Toggle ${client.name}`}
                        >
                          <ChevronDown className={`h-3 w-3 transition-transform ${clientExpanded ? "" : "-rotate-90"}`} />
                        </button>
                        <Link
                          href={directTasksHref}
                          className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm text-white/70 transition-colors hover:bg-[#36373a] hover:text-white"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: client.color || "#f06a6a" }}
                          />
                          <span className="truncate font-medium">{client.name}</span>
                          {client.directTaskCount > 0 ? (
                            <span className="ml-auto rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-white/40">
                              {client.directTaskCount}
                            </span>
                          ) : null}
                        </Link>
                      </div>

                      {clientExpanded ? (
                        <ul className="space-y-0.5 pl-8">
                          {client.projects.map((project) => {
                            const href = `/projects/${project.id}/${project.default_view}`
                            return (
                              <li key={project.id}>
                                <Link
                                  href={href}
                                  className={`flex min-h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors ${
                                    pathname?.includes(project.id)
                                      ? "bg-[#454649] font-semibold text-white"
                                      : "text-white/65 hover:bg-[#36373a] hover:text-white"
                                  }`}
                                >
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-white" style={{ backgroundColor: project.color || client.color || "#9f8fef" }}>
                                    <FolderKanban className="h-3 w-3" />
                                  </span>
                                  <span className="truncate">{project.name}</span>
                                </Link>
                              </li>
                            )
                          })}

                          {client.directTaskCount > 0 ? (
                            <li>
                              <Link
                                href={directTasksHref}
                                className="flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium text-white/45 transition-colors hover:bg-white/5 hover:text-white/75"
                              >
                                <Briefcase className="h-3.5 w-3.5 text-orange-400" />
                                Direct tasks
                              </Link>
                            </li>
                          ) : null}

                          {client.projects.length === 0 && client.directTaskCount === 0 ? (
                            <li className="px-3 py-1 text-xs text-white/25">No work added yet</li>
                          ) : null}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}

                {clients.length === 0 ? <li className="px-3 py-2 text-xs text-white/30">No clients yet</li> : null}
              </ul>
            ) : null}
          </div>
        </nav>

        <div className="space-y-0.5 border-t border-[#414245] p-3">
          <Link
            href="/account"
            className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-xs font-medium text-white/65 transition-colors hover:bg-[#36373a] hover:text-white"
          >
            <Settings className="h-3.5 w-3.5 text-violet-400" />
            Account
          </Link>
          {workspace?.canAdmin ? (
            <Link
              href="/admin/members"
              className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-xs font-medium text-white/65 transition-colors hover:bg-[#36373a] hover:text-white"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              {isSuperAdmin ? "Admin console" : "Manage members"}
            </Link>
          ) : null}
          {canImport ? (
            <Link
              href="/import"
              className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-xs font-medium text-white/65 transition-colors hover:bg-[#36373a] hover:text-white"
            >
              <Upload className="h-3.5 w-3.5 text-emerald-400" />
              Import CSV
            </Link>
          ) : null}
          <Link
            href="/help"
            className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-xs font-medium text-white/65 transition-colors hover:bg-[#36373a] hover:text-white"
          >
            <LifeBuoy className="h-3.5 w-3.5 text-blue-400" />
            Help center
          </Link>
          {workspace?.canAdmin ? (
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="mt-2 flex h-10 w-full items-center justify-center gap-3 rounded-md border border-[#57585b] px-3 text-xs font-semibold text-white/85 transition-colors hover:bg-[#36373a]"
            >
              <UserPlus className="h-3.5 w-3.5 text-orange-400" />
              Invite teammates
            </button>
          ) : null}
        </div>
      </aside>

      <Dialog open={isCreateWorkspaceOpen} onOpenChange={(open) => { if (!open) setIsCreateWorkspaceOpen(false) }}>
        <DialogContent className="border-white/10 bg-[#1e1f21] text-white sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Create workspace</DialogTitle>
            <p className="text-sm text-white/45">Create a separate space for a team or organization.</p>
          </DialogHeader>
          <form onSubmit={handleCreateWorkspace} className="space-y-4">
            {workspaceError ? <p className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{workspaceError}</p> : null}
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-white/80">Workspace name</span>
              <input
                autoFocus
                required
                minLength={2}
                maxLength={80}
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 outline-none focus:border-blue-500"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsCreateWorkspaceOpen(false)} className="h-9 rounded-md border border-white/10 px-4 text-sm text-white/70 hover:bg-white/5">Cancel</button>
              <button type="submit" disabled={workspacePending} className="h-9 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{workspacePending ? "Creating..." : "Create"}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isRenameWorkspaceOpen} onOpenChange={(open) => { if (!open) setIsRenameWorkspaceOpen(false) }}>
        <DialogContent className="border-white/10 bg-[#1e1f21] text-white sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Rename workspace</DialogTitle>
            <p className="text-sm text-white/45">The workspace address will remain unchanged.</p>
          </DialogHeader>
          <form onSubmit={handleRenameWorkspace} className="space-y-4">
            {workspaceError ? <p className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{workspaceError}</p> : null}
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-white/80">Workspace name</span>
              <input
                autoFocus
                required
                minLength={2}
                maxLength={80}
                value={renameName}
                onChange={(event) => setRenameName(event.target.value)}
                className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 outline-none focus:border-blue-500"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsRenameWorkspaceOpen(false)} className="h-9 rounded-md border border-white/10 px-4 text-sm text-white/70 hover:bg-white/5">Cancel</button>
              <button type="submit" disabled={workspacePending} className="h-9 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{workspacePending ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <CreateClientModal isOpen={isClientModalOpen} onClose={() => setIsClientModalOpen(false)} />
      <CreateProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        clients={projectClientOptions}
      />
      {workspace?.canAdmin ? (
        <AddMemberModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          workspaces={[{ id: workspace.id, name: workspace.name }]}
          initialWorkspaceId={workspace.id}
        />
      ) : null}
    </>
  )
}
