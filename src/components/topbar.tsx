"use client"

import Link from "next/link"
import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, HelpCircle, Bell, ChevronLeft, ChevronRight, Clock, Menu, Sparkles } from "lucide-react"

interface TopbarUser {
  name?: string | null
  email?: string | null
  image?: string | null
}

export default function Topbar({ user, hasUnreadNotifications = false }: { user?: TopbarUser; hasUnreadNotifications?: boolean }) {
  const router = useRouter()
  const [query, setQuery] = useState("")

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    router.push(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search")
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#3f3f46] bg-[#202023] px-3 sm:gap-4 sm:px-6">
      <div className="flex min-w-[88px] items-center gap-1 text-[#a1a1aa] md:min-w-32">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("taskflow:open-mobile-sidebar"))}
          className="flex h-9 w-9 items-center justify-center rounded-md text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5] lg:hidden"
          aria-label="Open navigation"
          aria-controls="mobile-sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button onClick={() => router.back()} className="flex h-8 w-8 items-center justify-center rounded-md text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]" aria-label="Go back">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => router.forward()} className="hidden h-8 w-8 items-center justify-center rounded-md text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5] sm:flex" aria-label="Go forward">
          <ChevronRight className="w-4 h-4" />
        </button>
        <Link href="/home" className="ml-1 hidden h-8 w-8 items-center justify-center rounded-md text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5] lg:flex" aria-label="Recent items">
          <Clock className="w-4 h-4" />
        </Link>
      </div>

      <div className="min-w-0 flex-1 sm:px-4">
        <form onSubmit={handleSubmit} className="group mx-auto flex h-9 w-full max-w-xl items-center rounded-md border border-[#3f3f46] bg-[#18181b] px-3 transition-colors focus-within:border-[#0075de] focus-within:bg-[#202023]">
          <Search className="mr-2 h-4 w-4 shrink-0 text-[#a1a1aa] group-focus-within:text-[#0075de]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks, projects, clients..."
            className="h-full w-full border-none bg-transparent text-sm text-[#f4f4f5] outline-none placeholder:text-[#a1a1aa]"
          />
        </form>
      </div>

      <div className="flex min-w-[84px] items-center justify-end gap-1.5 md:min-w-32">
        <Link href="/help" className="hidden h-8 w-8 items-center justify-center rounded-md border border-[#3f3f46] text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5] sm:flex" aria-label="Help center">
          <HelpCircle className="w-4 h-4" />
        </Link>
        <Link href="/reporting" className="hidden h-8 w-8 items-center justify-center rounded-md border border-[#0075de]/40 bg-[#0075de]/15 text-[#0075de] transition-colors hover:bg-[#0075de]/25 lg:flex" aria-label="Open insights">
          <Sparkles className="h-4 w-4" />
        </Link>
        <Link href="/inbox" className="relative flex h-8 w-8 items-center justify-center rounded-md text-[#a1a1aa] transition-colors hover:bg-[#27272a] hover:text-[#f4f4f5]" aria-label="Notifications">
          <Bell className="w-4 h-4" />
          {hasUnreadNotifications ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#0075de] ring-2 ring-[#202023]"></span> : null}
        </Link>
        <Link
          href="/account"
          title={user?.email || user?.name || "Account"}
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#3f3f46] bg-[#0075de] text-xs font-semibold text-white transition-opacity hover:opacity-90 sm:ml-1"
        >
          {user?.image ? (
            <img src={user.image} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            user?.name?.charAt(0) || "A"
          )}
        </Link>
      </div>
    </header>
  )
}
