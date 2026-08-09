import Link from "next/link"
import { HelpCircle, Search, LayoutGrid, CalendarRange, Inbox } from "lucide-react"

const helpItems = [
  {
    title: "Search faster",
    description: "Use the top search bar to find accessible tasks and projects.",
    href: "/search",
    icon: Search,
  },
  {
    title: "Work from project views",
    description: "Switch between overview, list, board, calendar, timeline, and dashboard from the project tabs.",
    href: "/home",
    icon: LayoutGrid,
  },
  {
    title: "Review schedules",
    description: "Use calendar and timeline views to understand due dates and date ranges.",
    href: "/home",
    icon: CalendarRange,
  },
  {
    title: "Track updates",
    description: "Open Inbox to review comments and recent activity across your workspace.",
    href: "/inbox",
    icon: Inbox,
  },
]

export default function HelpPage() {
  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar bg-[#1e1f21]">
      <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <HelpCircle className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-white/90">Help center</h1>
            <p className="text-sm text-white/40 mt-1">Quick guidance for the main workflows in this workspace.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {helpItems.map((item) => (
            <Link key={item.title} href={item.href} className="rounded-2xl border border-white/5 bg-[#262729] p-5 hover:bg-[#2d2e30] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 border border-white/10">
                <item.icon className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-white/85 font-semibold">{item.title}</h2>
              <p className="text-sm text-white/45 mt-2 leading-relaxed">{item.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
