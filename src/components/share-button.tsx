"use client"

import { useState } from "react"

export default function ShareButton({ label = "Share", className = "" }: { label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const url = window.location.href

    if (navigator.share) {
      try {
        await navigator.share({ url })
        return
      } catch {
        // Fall back to clipboard when share is cancelled/unavailable.
      }
    }

    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      onClick={() => void handleShare()}
      className={className}
      type="button"
    >
      {copied ? "Link copied" : label}
    </button>
  )
}
