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
import {
  LEGACY_SIDEBAR_EXPANDED_CLIENTS_STORAGE_KEY,
  normalizeCollapsedClientIds,
  resolveInitialCollapsedClientIds,
  SIDEBAR_COLLAPSED_CLIENTS_STORAGE_KEY,
  toggleCollapsedClientId,
} from "@/lib/sidebar-state"

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
  const clientsRef = useRef(clients)
  clientsRef.current = clients
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
  const [collapsedClientIds, setCollapsedClientIds] = useState<Set<string>>(new Set())
  const [hasLoadedCollapsedState, setHasLoadedCollapsedState] = useState(false)

  const projectClientOptions = useMemo(
    () => clients.map((client) => ({ id: client.id, name: client.name, color: client.color })),
    [clients]
  )

  useEffect(() => {
    setHasLoadedCollapsedState(false)
    setCollapsedClientIds(resolveInitialCollapsedClientIds({
      clientIds: clientsRef.current.map((client) => client.id),
      collapsedStorageValue: window.localStorage.getItem(SIDEBAR_COLLAPSED_CLIENTS_STORAGE_KEY),
      legacyExpandedStorageValue: window.localStorage.getItem(LEGACY_SIDEBAR_EXPANDED_CLIENTS_STORAGE_KEY),
    }))
    setHasLoadedCollapsedState(true)
  }, [workspace?.id])

  const clientIdsKey = clients.map((client) => client.id).join("\u0000")

  useEffect(() => {
    if (!hasLoadedCollapsedState) return
    const clientIds = clientIdsKey ? clientIdsKey.split("\u0000") : []
    setCollapsedClientIds((current) => normalizeCollapsedClientIds(current, clientIds))
  }, [clientIdsKey, hasLoadedCollapsedState])

  useEffect(() => {
    if (!hasLoadedCollapsedState) return

    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_CLIENTS_STORAGE_KEY,
      JSON.stringify(Array.from(collapsedClientIds))
    )
  }, [collapsedClientIds, hasLoadedCollapsedState])

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
    setCollapsedClientIds((previous) => toggleCollapsedClientId(previous, clientId))
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
        className={`shrink-0 flex-col border-r border-[#3f3f46] bg-[#18181b] ${
          isMobileMenuOpen
            ? "fixed inset-y-0 left-0 z-50 flex w-[min(88vw,320px)] shadow-2xl shadow-black/80"
            : "hidden"
        } lg:static lg:z-auto lg:flex lg:w-[260px] lg:shadow-none`}
      >
        <div className="flex h-14 items-center justify-between border-b border-[#3f3f46] px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Menu className="hidden h-4 w-4 shrink-0 text-[#a1a1aa] lg:block" />
            <div className="relative h-6 w-6 shrink-0" aria-hidden="true">
              <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[#0075de]" />
              <span className="absolute bottom-0 left-0 h-2 w-2 rounded-full bg-[#0075de]" />
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-[#0075de]" />
            </div>
            <span className="truncate text-base font-semibold tracking-[-0.02em] text-[#f4f4f5]">TaskFlow</span>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5] lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3 custom-scrollbar">
          <div className="relative mb-3">
            <button
              onClick={() => setIsCreateMenuOpen((current) => !current)}
              className="group flex h-9 items-center gap-2 rounded-full bg-[#0075de] px-4 text-xs font-semibold text-white transition-all hover:bg-[#005bab] shadow-sm active:scale-95"
            >
              <Plus className="h-4 w-4 text-white" />
              Create
            </button>

            {isCreateMenuOpen ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-lg border border-[#3f3f46] bg-[#202023] p-1.5 shadow-2xl">
                <button
                  onClick={() => {
                    setIsCreateMenuOpen(false)
                    setIsClientModalOpen(true)
                  }}
                  className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-xs font-medium text-[#f4f4f5] transition-colors hover:bg-[#27272a]"
                >
                  <Briefcase className="h-3.5 w-3.5 text-[#0075de]" />
                  New client
                </button>
                <button
                  onClick={() => {
                    setIsCreateMenuOpen(false)
                    setIsProjectModalOpen(true)
                  }}
                  className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-xs font-medium text-[#f4f4f5] transition-colors hover:bg-[#27272a]"
                >
                  <FolderKanban className="h-3.5 w-3.5 text-[#0075de]" />
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
              className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-xs font-semibold text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
            >
              <span className="truncate">{workspace?.name || "Choose a workspace"}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isWorkspaceMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {isWorkspaceMenuOpen ? (
              <div role="menu" aria-label="Workspaces" className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-[#3f3f46] bg-[#202023] p-1.5 shadow-2xl">
                <div className="max-h-56 overflow-y-auto custom-scrollbar">
                  {workspaces.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={item.id === workspace?.id}
                      disabled={workspacePending}
                      onClick={() => handleWorkspaceSwitch(item.id)}
                      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[#f4f4f5] transition-colors hover:bg-[#27272a] disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.name}</span>
                        <span className="block truncate text-[10px] capitalize text-[#a1a1aa]">{item.effectiveRole}</span>
                      </span>
                      {item.id === workspace?.id ? <Check className="h-3.5 w-3.5 shrink-0 text-[#0075de]" aria-label="Active" /> : null}
                    </button>
                  ))}
                </div>

                <div className="mt-1 border-t border-[#3f3f46] pt-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsWorkspaceMenuOpen(false)
                      setWorkspaceError("")
                      setIsCreateWorkspaceOpen(true)
                    }}
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
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
                      className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
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
                      className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Manage members
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
            {workspaceError && isWorkspaceMenuOpen ? <p className="px-3 pt-1 text-xs text-red-400">{workspaceError}</p> : null}
          </div>

          <ul className="space-y-0.5">
            {primaryLinks.map((link) => (
              <li key={link.name}>
                <Link
                  href={link.href}
                  className={`flex h-9 items-center gap-3 rounded-md px-3 text-xs transition-colors ${
                    isActive(link.href)
                      ? "bg-[#27272a] font-semibold text-[#f4f4f5]"
                      : "text-[#a1a1aa] hover:bg-[#27272a]/60 hover:text-[#f4f4f5]"
                  }`}
                >
                   <link.icon className="h-4 w-4 text-[#a1a1aa]" />
                   {link.name}
                   {link.badge > 0 ? <span className="ml-auto rounded-full bg-[#0075de] px-2 py-0.5 text-[10px] font-bold text-white">{link.badge > 99 ? "99+" : link.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>

          <div className="pt-4">
            <button
              onClick={() => setInsightsExpanded((current) => !current)}
              className="mb-1 flex h-7 w-full items-center gap-1.5 px-3 text-[12px] font-bold uppercase tracking-wider text-[#71717a] transition-colors hover:text-[#f4f4f5]"
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
                      className={`flex h-9 items-center gap-3 rounded-md px-3 text-xs transition-colors ${
                        isActive(link.href)
                          ? "bg-[#27272a] font-semibold text-[#f4f4f5]"
                          : "text-[#a1a1aa] hover:bg-[#27272a]/60 hover:text-[#f4f4f5]"
                      }`}
                    >
                      <link.icon className="h-3.5 w-3.5" />
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="pt-4">
            <button
              onClick={() => setStarredExpanded((current) => !current)}
              className="mb-1 flex h-7 w-full items-center gap-1.5 px-3 text-[12px] font-bold uppercase tracking-wider text-[#71717a] transition-colors hover:text-[#f4f4f5]"
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
                            className={`flex min-h-8 items-center gap-3 rounded-md px-3 py-1.5 text-xs transition-colors ${
                              pathname?.includes(project.id)
                                ? "bg-[#27272a] font-semibold text-[#f4f4f5]"
                                : "text-[#a1a1aa] hover:bg-[#27272a]/60 hover:text-[#f4f4f5]"
                            }`}
                          >
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{project.name}</div>
                              {project.client?.name ? <div className="truncate text-[10px] text-[#71717a]">{project.client.name}</div> : null}
                            </div>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="px-3 py-1.5 text-xs italic text-[#71717a]">No starred items</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="pb-6 pt-4">
            <div className="group mb-1 flex items-center justify-between px-3">
              <button
                onClick={() => setClientsExpanded((current) => !current)}
                className="flex h-7 items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#71717a] transition-colors hover:text-[#f4f4f5]"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${clientsExpanded ? "" : "-rotate-90"}`} />
                Clients
              </button>
              <button
                onClick={() => setIsClientModalOpen(true)}
                className="rounded p-1 transition-opacity hover:bg-[#27272a]"
                aria-label="Create new client"
              >
                <Plus className="h-3.5 w-3.5 text-[#71717a]" />
              </button>
            </div>

            {clientsExpanded ? (
              <ul className="space-y-0.5">
                {clients.map((client) => {
                  const clientExpanded = !collapsedClientIds.has(client.id)
                  const directTasksHref = `/clients?clientId=${client.id}`

                  return (
                    <li key={client.id} className="space-y-0.5">
                      <div className="flex items-center gap-1 px-1">
                        <button
                          onClick={() => toggleClient(client.id)}
                          className="rounded p-1 text-[#71717a] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
                          aria-label={`Toggle ${client.name}`}
                        >
                          <ChevronDown className={`h-3 w-3 transition-transform ${clientExpanded ? "" : "-rotate-90"}`} />
                        </button>
                        <Link
                          href={directTasksHref}
                          prefetch={false}
                          className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-xs text-[#f4f4f5] transition-colors hover:bg-[#27272a]"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: client.color || "#0075de" }}
                          />
                          <span className="truncate font-medium">{client.name}</span>
                          {client.directTaskCount > 0 ? (
                            <span className="ml-auto rounded-full bg-[#27272a] px-1.5 py-0.5 text-[10px] font-bold text-[#a1a1aa]">
                              {client.directTaskCount}
                            </span>
                          ) : null}
                        </Link>
                      </div>

                      {clientExpanded ? (
                        <ul className="space-y-0.5 pl-6">
                          {client.projects.map((project) => {
                            const href = `/projects/${project.id}/${project.default_view}`
                            return (
                              <li key={project.id}>
                                <Link
                                  href={href}
                                  className={`flex min-h-8 items-center gap-2 rounded-md px-2 text-xs transition-colors ${
                                    pathname?.includes(project.id)
                                      ? "bg-[#27272a] font-semibold text-[#f4f4f5]"
                                      : "text-[#a1a1aa] hover:bg-[#27272a]/60 hover:text-[#f4f4f5]"
                                  }`}
                                >
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-white" style={{ backgroundColor: project.color || client.color || "#0075de" }}>
                                    <FolderKanban className="h-2.5 w-2.5" />
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
                                prefetch={false}
                                className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-medium text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
                              >
                                <Briefcase className="h-3 w-3 text-[#0075de]" />
                                Direct tasks
                              </Link>
                            </li>
                          ) : null}

                          {client.projects.length === 0 && client.directTaskCount === 0 ? (
                            <li className="px-2 py-1 text-[11px] text-[#71717a]">No work added yet</li>
                          ) : null}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}

                {clients.length === 0 ? <li className="px-3 py-1.5 text-xs text-[#71717a]">No clients yet</li> : null}
              </ul>
            ) : null}
          </div>
        </nav>

        <div className="space-y-0.5 border-t border-[#3f3f46] p-3 bg-[#18181b]">
          <Link
            href="/account"
            className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-xs font-medium text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
          >
            <Settings className="h-3.5 w-3.5 text-[#a1a1aa]" />
            Account
          </Link>
          {workspace?.canAdmin ? (
            <Link
              href="/admin/members"
              className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-xs font-medium text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[#a1a1aa]" />
              {isSuperAdmin ? "Admin console" : "Manage members"}
            </Link>
          ) : null}
          {canImport ? (
            <Link
              href="/import"
              className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-xs font-medium text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
            >
              <Upload className="h-3.5 w-3.5 text-[#a1a1aa]" />
              Import CSV
            </Link>
          ) : null}
          <Link
            href="/help"
            className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-xs font-medium text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]"
          >
            <LifeBuoy className="h-3.5 w-3.5 text-[#a1a1aa]" />
            Help center
          </Link>
          {workspace?.canAdmin ? (
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-full border border-[#0075de] text-xs font-semibold text-[#0075de] transition-colors hover:bg-[#0075de] hover:text-white"
            >
              <UserPlus className="h-3.5 w-3.5" />
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
