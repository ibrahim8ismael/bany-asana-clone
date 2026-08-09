"use client"

import type { CSSProperties, ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"

export interface TaskSelectOption {
  id: string
  label: string
  description?: string | null
  avatarUrl?: string | null
  color?: string | null
}

interface TaskSelectMenuProps {
  value: string | null | undefined
  options: TaskSelectOption[]
  placeholder: string
  searchPlaceholder: string
  emptyLabel: string
  onChange: (nextValue: string | null) => void
  renderLeading?: (option: TaskSelectOption) => ReactNode
}

export default function TaskSelectMenu({
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  onChange,
  renderLeading,
}: TaskSelectMenuProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [menuPosition, setMenuPosition] = useState<CSSProperties | null>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => options.find((option) => option.id === value) || null,
    [options, value]
  )

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return options

    return options.filter((option) => {
      return [option.label, option.description || ""]
        .join(" ")
        .toLowerCase()
        .includes(term)
    })
  }, [options, search])

  useEffect(() => {
    if (!open) return

    const updateMenuPosition = () => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const viewportPadding = 8
      const menuGap = 8
      const spaceBelow = window.innerHeight - rect.bottom - menuGap - viewportPadding
      const spaceAbove = rect.top - menuGap - viewportPadding
      const openAbove = spaceBelow < 240 && spaceAbove > spaceBelow
      const availableHeight = openAbove ? spaceAbove : spaceBelow
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2)
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - width - viewportPadding
      )

      setMenuPosition({
        ...(openAbove
          ? { bottom: window.innerHeight - rect.top + menuGap }
          : { top: rect.bottom + menuGap }),
        left,
        width,
        maxHeight: Math.max(80, Math.min(352, availableHeight)),
      })
      setPortalTarget(
        (container.closest('[data-slot="sheet-content"]') as HTMLElement | null) || document.body
      )
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    updateMenuPosition()
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 0)
    window.addEventListener("mousedown", handleClickOutside)
    window.addEventListener("resize", updateMenuPosition)
    window.addEventListener("scroll", updateMenuPosition, true)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener("mousedown", handleClickOutside)
      window.removeEventListener("resize", updateMenuPosition)
      window.removeEventListener("scroll", updateMenuPosition, true)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative min-w-0 w-full max-w-[280px]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-zinc-900"
      >
        <div className="min-w-0 flex-1 text-left">
          {selected ? (
            <div className="flex items-center gap-2 min-w-0">
              {renderLeading ? renderLeading(selected) : null}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">{selected.label}</div>
                {selected.description && (
                  <div className="truncate text-[11px] text-gray-400">{selected.description}</div>
                )}
              </div>
            </div>
          ) : (
            <span className="text-sm font-medium text-gray-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {open && menuPosition && portalTarget ? createPortal(
        <div ref={menuRef} style={menuPosition} className="fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-gray-100 p-3 dark:border-zinc-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                ref={inputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                className="pl-8"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
                setSearch("")
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              <X className="h-4 w-4" />
              Clear selection
            </button>

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-5 text-center text-sm text-gray-400">{emptyLabel}</div>
            ) : (
              filteredOptions.map((option) => {
                const active = option.id === value

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option.id)
                      setOpen(false)
                      setSearch("")
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-zinc-900"
                  >
                    {renderLeading ? renderLeading(option) : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{option.label}</div>
                      {option.description && (
                        <div className="truncate text-[11px] text-gray-400">{option.description}</div>
                      )}
                    </div>
                    {active ? <Check className="h-4 w-4 text-blue-500" /> : null}
                  </button>
                )
              })
            )}
          </div>
        </div>,
        portalTarget
      ) : null}
    </div>
  )
}
