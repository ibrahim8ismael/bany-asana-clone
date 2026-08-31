import { format, isPast, isToday, isTomorrow, isYesterday } from "date-fns"

export type DueDatePresentation = {
  label: string
  tone: "today" | "yesterday" | "tomorrow" | "overdue" | "future" | "none"
  className: string
  isOverdue: boolean
}

export function getDueDatePresentation(dueDate: string | Date | null | undefined): DueDatePresentation {
  if (!dueDate) return { label: "", tone: "none", className: "", isOverdue: false }
  const d = dueDate instanceof Date ? dueDate : new Date(dueDate)
  if (Number.isNaN(d.getTime())) return { label: "", tone: "none", className: "", isOverdue: false }

  if (isToday(d)) {
    return {
      label: "Today",
      tone: "today",
      className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      isOverdue: false,
    }
  }
  if (isYesterday(d)) {
    return {
      label: "Yesterday",
      tone: "yesterday",
      className: "text-rose-400 bg-rose-500/10 border-rose-500/30",
      isOverdue: true,
    }
  }
  if (isTomorrow(d)) {
    return {
      label: "Tomorrow",
      tone: "tomorrow",
      className: "text-amber-300 bg-amber-500/10 border-amber-500/30",
      isOverdue: false,
    }
  }
  if (isPast(d)) {
    return {
      label: format(d, "MMM d"),
      tone: "overdue",
      className: "text-rose-400 bg-rose-500/10 border-rose-500/30",
      isOverdue: true,
    }
  }

  return {
    label: format(d, "MMM d"),
    tone: "future",
    className: "text-[#a1a1aa] border-[#3f3f46]",
    isOverdue: false,
  }
}
