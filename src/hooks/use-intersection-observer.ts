"use client"

import { useEffect, useRef, useCallback } from "react"

interface UseIntersectionObserverOptions extends IntersectionObserverInit {
  enabled?: boolean
  onIntersect: () => void
}

export function useIntersectionObserver({
  enabled = true,
  onIntersect,
  root = null,
  rootMargin = "200px",
  threshold = 0,
}: UseIntersectionObserverOptions) {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const callbackRef = useRef(onIntersect)

  // Keep callback fresh without re-creating observer
  useEffect(() => {
    callbackRef.current = onIntersect
  }, [onIntersect])

  const setTarget = useCallback(
    (node: Element | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      if (!enabled || !node) return

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            callbackRef.current()
          }
        },
        { root, rootMargin, threshold }
      )
      observerRef.current.observe(node)
    },
    [enabled, root, rootMargin, threshold]
  )

  useEffect(() => {
    return () => observerRef.current?.disconnect()
  }, [])

  return setTarget
}
