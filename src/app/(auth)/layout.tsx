import { CheckCircle2, FolderKanban, ListTodo, Users2 } from "lucide-react"

const highlights = [
  {
    title: "Pick up where work paused",
    description: "Jump straight back into active clients, project boards, and handoffs without hunting for context.",
    icon: ListTodo,
  },
  {
    title: "Keep teams aligned",
    description: "Shared workspaces, clear ownership, and fast updates keep internal collaboration moving.",
    icon: Users2,
  },
  {
    title: "Stay close to delivery",
    description: "Tasks, milestones, and client-facing work all stay connected in one place.",
    icon: FolderKanban,
  },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain bg-[#111315] text-white custom-scrollbar">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.08),transparent_30%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.03),transparent_32%),linear-gradient(0deg,rgba(0,0,0,0.35),rgba(0,0,0,0.35))]" />

      <div className="relative flex min-h-dvh items-start justify-center px-3 py-3 sm:px-6 sm:py-8 lg:items-center lg:px-10">
        <div className="grid w-full max-w-6xl gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center lg:gap-10">
          <section className="order-2 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_32px_120px_rgba(0,0,0,0.35)] backdrop-blur-sm sm:rounded-[32px] sm:p-8 lg:order-1 lg:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65">
              <CheckCircle2 className="h-3.5 w-3.5 text-orange-300" />
              TaskFlow
            </div>

            <div className="mt-5 max-w-2xl sm:mt-6">
              <h2 className="text-balance text-[clamp(1.65rem,8vw,3.5rem)] font-semibold leading-[1.08] tracking-tight text-white sm:leading-[1.05] lg:leading-[1.02]">
                Work stays clear when the front door does too.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-white/65 sm:text-base">
                Sign in or create an account to get back to client work, project momentum, and the tasks your team needs to move today.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-sm text-white/70">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">Clients</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">Projects</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">Task handoffs</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">Delivery updates</span>
            </div>

            <div className="mt-8 hidden gap-4 sm:grid sm:grid-cols-3">
              {highlights.map((item) => (
                <div key={item.title} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <item.icon className="h-5 w-5 text-orange-300" />
                  <div className="mt-4 text-sm font-semibold text-white">{item.title}</div>
                  <p className="mt-2 text-sm leading-6 text-white/50">{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="order-1 flex items-center justify-center lg:order-2 lg:justify-end">{children}</div>
        </div>
      </div>
    </div>
  )
}
