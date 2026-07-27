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
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#15171a]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <div className="border-b border-white/8 px-5 py-5 sm:px-7 sm:py-7">
          <div className="inline-flex items-center rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-100">
            {eyebrow}
          </div>
          <h1 className="mt-4 text-[clamp(1.5rem,7vw,2rem)] font-semibold leading-tight tracking-tight text-white">{title}</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/65">{description}</p>
        </div>

        <div className="px-5 py-5 sm:px-7 sm:py-6">{children}</div>

        <div className="border-t border-white/8 bg-white/[0.03] px-5 py-4 text-sm text-white/55 sm:px-7">
          {footer}
        </div>
      </div>
    </section>
  )
}
