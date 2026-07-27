"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft } from "lucide-react"

const views = [
  { key: "overview", label: "Overview" },
  { key: "list", label: "List" },
  { key: "board", label: "Board" },
  { key: "timeline", label: "Timeline" },
  { key: "calendar", label: "Calendar" },
]

export default function ProjectViewTabs({ projectId, clientId }: { projectId: string; clientId?: string | null }) {
  const pathname = usePathname()

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[#414245] bg-[#1e1f21] px-4 sm:px-7">
      <div className="flex h-full items-center gap-1 overflow-x-auto scrollbar-hide">
        {clientId ? (
          <Link href={`/clients?clientId=${clientId}`} className="mr-2 inline-flex h-full shrink-0 items-center gap-2 border-r border-[#414245] px-2 pr-4 text-[13px] font-medium text-white/55 transition-colors hover:text-white/90">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Client</span>
          </Link>
        ) : null}

        {views.map((view) => {
          const href = `/projects/${projectId}/${view.key}`
          const isActive = pathname === href || pathname?.startsWith(href + "/")
          const isOverview = view.key === "overview" && (pathname === `/projects/${projectId}` || pathname === `/projects/${projectId}/overview`)
          const finalActive = isActive || isOverview

          return (
            <Link
              key={view.key}
              href={href}
              className={`relative flex h-full shrink-0 items-center px-3 text-sm font-semibold transition-colors ${
                finalActive ? "text-white" : "text-white/55 hover:text-white/85"
              }`}
            >
              {view.label}
              {finalActive ? <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full bg-white/90" /> : null}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
