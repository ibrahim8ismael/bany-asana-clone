"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { usePathname, useSearchParams } from "next/navigation"

export function TopProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)
  const prevPathRef = useRef<string>("")
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentPath = `${pathname}?${searchParams.toString()}`

  const startNavigating = useCallback(() => {
    setIsNavigating(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    // Auto-hide after 10s in case navigation hangs
    timeoutRef.current = setTimeout(() => setIsNavigating(false), 10000)
  }, [])

  // Detect navigation completion
  useEffect(() => {
    if (prevPathRef.current === "") {
      prevPathRef.current = currentPath
      return
    }
    if (prevPathRef.current !== currentPath) {
      prevPathRef.current = currentPath
      // Small delay to avoid flicker, then hide
      const t = setTimeout(() => {
        setIsNavigating(false)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
      }, 300)
      return () => clearTimeout(t)
    }
  }, [currentPath])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const anchor = target.closest("a[href]")
      if (!anchor) return
      const href = anchor.getAttribute("href")
      if (!href) return
      // Ignore external, hash, mailto, tel, and new-tab links
      if (
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        anchor.getAttribute("target") === "_blank"
      ) {
        return
      }
      // Ignore same-page navigation
      const url = new URL(href, window.location.origin)
      const nextPath = `${url.pathname}?${url.searchParams.toString()}`
      if (nextPath === currentPath) return
      startNavigating()
    }

    const handlePopState = () => {
      startNavigating()
    }

    // Intercept programmatic navigations via history API
    const originalPushState = history.pushState.bind(history)
    const originalReplaceState = history.replaceState.bind(history)

    const patchedPushState: typeof history.pushState = function (...args) {
      const url = args[2]
      if (typeof url === "string") {
        const parsed = new URL(url, window.location.origin)
        const next = `${parsed.pathname}?${parsed.searchParams.toString()}`
        if (next !== currentPath) startNavigating()
      }
      return originalPushState(...args)
    }

    const patchedReplaceState: typeof history.replaceState = function (...args) {
      return originalReplaceState(...args)
    }

    document.addEventListener("click", handleClick, true)
    window.addEventListener("popstate", handlePopState)
    history.pushState = patchedPushState
    history.replaceState = patchedReplaceState

    return () => {
      document.removeEventListener("click", handleClick, true)
      window.removeEventListener("popstate", handlePopState)
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [currentPath, startNavigating])

  if (!isNavigating) return null

  return (
    <div
      role="progressbar"
      aria-busy="true"
      aria-label="Loading page"
      className="pointer-events-none fixed left-0 right-0 top-0 z-[9999] h-[2px] overflow-hidden bg-transparent"
    >
      <div className="h-full w-full origin-left bg-[#0075de] animate-[topProgress_1.2s_ease-in-out_infinite]" />
      <style>{`@keyframes topProgress { 0% { transform: translateX(-100%); } 50% { transform: translateX(0%); } 100% { transform: translateX(100%); } }`}</style>
    </div>
  )
}

export function RouteTransitionOverlay({ isPending, label }: { isPending: boolean; label?: string }) {
  if (!isPending) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-start justify-center pt-20">
      <div className="flex items-center gap-2 rounded-full border border-[#3f3f46] bg-[#202023] px-4 py-2 shadow-lg">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#3f3f46] border-t-[#0075de]" />
        <span className="text-xs font-medium text-[#f4f4f5]">{label || "Loading..."}</span>
      </div>
    </div>
  )
}
