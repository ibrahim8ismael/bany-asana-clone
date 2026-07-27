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
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-[#414245] bg-[#2a2b2d] px-2 sm:gap-3 sm:px-5">
      <div className="flex min-w-[88px] items-center gap-0.5 text-white/55 md:min-w-32 md:gap-1">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("taskflow:open-mobile-sidebar"))}
          className="flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-white/5 hover:text-white lg:hidden"
          aria-label="Open navigation"
          aria-controls="mobile-sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button onClick={() => router.back()} className="flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-white/5 hover:text-white sm:h-8 sm:w-8" aria-label="Go back">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => router.forward()} className="hidden h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-white/5 hover:text-white sm:flex" aria-label="Go forward">
          <ChevronRight className="w-4 h-4" />
        </button>
        <Link href="/home" className="ml-1 hidden h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-white/5 hover:text-white lg:flex" aria-label="Recent items">
          <Clock className="w-4 h-4" />
        </Link>
      </div>

      <div className="min-w-0 flex-1 sm:px-4">
        <form onSubmit={handleSubmit} className="group mx-auto flex h-11 w-full max-w-2xl items-center rounded-full border border-transparent bg-[#57585b] px-3 transition-colors focus-within:border-white/20 focus-within:bg-[#606164] sm:h-10 sm:px-4">
          <Search className="mr-2 h-4 w-4 shrink-0 text-white/75" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-full w-full border-none bg-transparent text-sm text-white outline-none placeholder:text-white/75"
          />
        </form>
      </div>

      <div className="flex min-w-[84px] items-center justify-end gap-0.5 sm:gap-1.5 md:min-w-32">
        <Link href="/help" className="hidden h-9 w-9 items-center justify-center rounded-full border border-[#626367] text-white/60 transition-colors hover:bg-white/5 hover:text-white sm:flex" aria-label="Help center">
          <HelpCircle className="w-4 h-4" />
        </Link>
        <Link href="/reporting" className="hidden h-9 w-9 items-center justify-center rounded-full border border-[#f06a6a]/70 text-[#f06a6a] transition-colors hover:bg-[#f06a6a]/10 lg:flex" aria-label="Open insights">
          <Sparkles className="h-4 w-4" />
        </Link>
        <Link href="/inbox" className="relative flex h-11 w-11 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/5 hover:text-white sm:h-9 sm:w-9" aria-label="Notifications">
          <Bell className="w-4 h-4" />
          {hasUnreadNotifications ? <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full border border-[#2a2b2d] bg-[#f06a6a]"></span> : null}
        </Link>
        <Link
          href="/account"
          title={user?.email || user?.name || "Account"}
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-[#6cc3d5] text-xs font-semibold text-[#243238] transition-opacity hover:opacity-85 sm:ml-1 sm:h-9 sm:w-9"
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
