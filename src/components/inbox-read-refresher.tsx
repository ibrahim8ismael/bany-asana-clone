"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function InboxReadRefresher({ shouldRefresh }: { shouldRefresh: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!shouldRefresh) return
    router.refresh()
  }, [router, shouldRefresh])

  return null
}
