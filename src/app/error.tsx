"use client"

import { useEffect } from "react"
import { AlertCircle, RotateCcw } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] px-6 text-center">
      <div className="relative">
        <div className="absolute -inset-10 animate-pulse rounded-full bg-rose-500/10 blur-3xl" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-[#27272a] bg-[#18181b] shadow-2xl">
          <AlertCircle className="h-10 w-10 text-rose-500" />
        </div>
      </div>
      <h1 className="mt-10 text-3xl font-bold tracking-tight text-white sm:text-4xl">Something went wrong</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[#a1a1aa]">
        An unexpected error occurred. We've logged the issue and are looking into it. 
        You can try refreshing the page or returning to the dashboard.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <button 
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-full border border-[#3f3f46] bg-[#18181b] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#27272a] active:scale-95"
        >
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
        <button 
          onClick={() => window.location.href = "/"}
          className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-transform hover:scale-105 active:scale-95"
        >
          Return Home
        </button>
      </div>
    </div>
  )
}
