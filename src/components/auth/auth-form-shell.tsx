import type { ReactNode } from "react"

type AuthFormShellProps = {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}

export default function AuthFormShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: AuthFormShellProps) {
  return (
    <section className="w-full max-w-[460px]">
      <div className="overflow-hidden rounded-2xl border border-[#3f3f46] bg-[#202023] text-[#f4f4f5] shadow-2xl">
        <div className="border-b border-[#3f3f46] px-6 py-6">
          <div className="inline-flex items-center rounded-full border border-[#0075de]/30 bg-[#0075de]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#60a5fa]">
            {eyebrow}
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#f4f4f5]">{title}</h1>
          <p className="mt-2 text-xs leading-relaxed text-[#a1a1aa]">{description}</p>
        </div>

        <div className="px-6 py-6">{children}</div>

        <div className="border-t border-[#3f3f46] bg-[#18181b] px-6 py-4 text-xs text-[#a1a1aa]">
          {footer}
        </div>
      </div>
    </section>
  )
}
