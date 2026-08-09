"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft } from "lucide-react"

const views = [
  { key: "board", label: "Board" },
  { key: "list", label: "List" },
]

export default function ProjectViewTabs({ projectId, clientId }: { projectId: string; clientId?: string | null }) {
  const pathname = usePathname()

  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-[#3f3f46] bg-[#202023] px-4 sm:px-6">
      <div className="flex h-full items-center gap-1 overflow-x-auto scrollbar-hide">
        {clientId ? (
          <Link href={`/clients?clientId=${clientId}`} className="mr-2 inline-flex h-full shrink-0 items-center gap-2 border-r border-[#3f3f46] px-2 pr-4 text-[13px] font-medium text-[#a1a1aa] transition-colors hover:text-[#f4f4f5]">
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
              className={`relative flex h-full shrink-0 items-center px-3 text-xs font-semibold transition-colors ${
                finalActive ? "text-[#0075de]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
              }`}
            >
              {view.label}
              {finalActive ? <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full bg-[#0075de]" /> : null}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
