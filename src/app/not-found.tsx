import Link from "next/link"
import { Search } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] px-6 text-center">
      <div className="relative">
        <div className="absolute -inset-10 animate-pulse rounded-full bg-[#0075de]/20 blur-3xl" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-[#27272a] bg-[#18181b] shadow-2xl">
          <Search className="h-10 w-10 text-[#a1a1aa]" />
        </div>
      </div>
      <h1 className="mt-10 text-4xl font-bold tracking-tight text-white sm:text-5xl">Page not found</h1>
      <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-[#a1a1aa]">
        We couldn't find the page you're looking for. It might have been moved or deleted.
      </p>
      <div className="mt-10">
        <Link 
          href="/" 
          className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-transform hover:scale-105 active:scale-95"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  )
}
