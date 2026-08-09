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
    <div className="relative min-h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain bg-[#18181b] text-[#f4f4f5] custom-scrollbar">
      <div className="relative flex min-h-dvh items-start justify-center px-4 py-6 sm:px-6 sm:py-10 lg:items-center lg:px-10">
        <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center lg:gap-10">
          <section className="order-2 overflow-hidden rounded-2xl border border-[#3f3f46] bg-[#202023] p-6 shadow-xl sm:p-8 lg:order-1 lg:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#0075de]/30 bg-[#0075de]/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#60a5fa]">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#0075de]" />
              TaskFlow
            </div>

            <div className="mt-6 max-w-2xl">
              <h2 className="text-balance text-3xl font-bold tracking-tight text-[#f4f4f5] sm:text-4xl">
                Work stays clear when the front door does too.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#a1a1aa] sm:text-base">
                Sign in or create an account to get back to client work, project momentum, and the tasks your team needs to move today.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-[#a1a1aa]">
              <span className="rounded-full border border-[#3f3f46] bg-[#18181b] px-3.5 py-1.5">Clients</span>
              <span className="rounded-full border border-[#3f3f46] bg-[#18181b] px-3.5 py-1.5">Projects</span>
              <span className="rounded-full border border-[#3f3f46] bg-[#18181b] px-3.5 py-1.5">Task handoffs</span>
              <span className="rounded-full border border-[#3f3f46] bg-[#18181b] px-3.5 py-1.5">Delivery updates</span>
            </div>

            <div className="mt-8 hidden gap-4 sm:grid sm:grid-cols-3">
              {highlights.map((item) => (
                <div key={item.title} className="rounded-xl border border-[#3f3f46] bg-[#18181b] p-4">
                  <item.icon className="h-5 w-5 text-[#0075de]" />
                  <div className="mt-3 text-xs font-bold text-[#f4f4f5]">{item.title}</div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#a1a1aa]">{item.description}</p>
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
