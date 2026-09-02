"use client"

import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface LoaderProps {
  className?: string
  size?: "sm" | "default" | "lg"
  label?: string
  fullscreen?: boolean
}

const sizeMap = {
  sm: "h-4 w-4",
  default: "h-6 w-6",
  lg: "h-8 w-8",
} as const

export function Loader({ className, size = "default", label = "Loading...", fullscreen = false }: LoaderProps) {
  const spinner = (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn("inline-flex items-center justify-center", className)}
    >
      <Loader2 className={cn("animate-spin text-[#0075de]", sizeMap[size])} />
      <span className="sr-only">{label}</span>
    </div>
  )

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18181b]/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          {spinner}
          <p className="text-xs font-medium text-[#a1a1aa] animate-pulse">{label}</p>
        </div>
      </div>
    )
  }

  return spinner
}

export function PageLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <Loader size="lg" label={label} />
      <p className="text-sm font-medium text-[#a1a1aa] animate-pulse">{label}</p>
    </div>
  )
}

export function InlineLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6">
      <Loader size="sm" label={label} />
      <span className="text-xs font-medium text-[#a1a1aa]">{label}</span>
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-[#3f3f46] bg-[#202023] p-4">
      <div className="mb-3 h-3 w-3/4 rounded bg-[#27272a]" />
      <div className="mb-2 h-2 w-full rounded bg-[#27272a]" />
      <div className="h-2 w-2/3 rounded bg-[#27272a]" />
    </div>
  )
}
