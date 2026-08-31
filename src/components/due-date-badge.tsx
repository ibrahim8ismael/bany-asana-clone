"use client"
import { Calendar } from "lucide-react"
import { getDueDatePresentation } from "@/lib/due-date"

export function DueDateBadge({ dueDate, withIcon = true, className = "" }: { dueDate: string | Date | null | undefined; withIcon?: boolean; className?: string }) {
  if (!dueDate) return null
  const due = getDueDatePresentation(dueDate)
  if (!due.label) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${due.className} ${className}`}>
      {withIcon ? <Calendar className="h-3 w-3" /> : null}
      {due.label}
    </span>
  )
}
