import Link from "next/link"
import { getServerSession } from "next-auth"
import { Search, FolderKanban, CheckSquare } from "lucide-react"
import { format } from "date-fns"
import { authOptions } from "@/lib/auth"
import { getSearchResults } from "@/lib/dashboard-data"

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const query = q?.trim() || ""
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  const { projects, tasks } = query && userId ? await getSearchResults(userId, query) : { projects: [], tasks: [] }

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar bg-[#1e1f21]">
      <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-white/90">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Search className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Search</h1>
              <p className="text-sm text-white/40">Find projects and tasks you can access.</p>
            </div>
          </div>
        </div>

        {!query ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-white/35">
            Use the search box in the top bar to find tasks or projects.
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/5 bg-[#2a2b2d] p-5 text-sm text-white/60">
              Showing results for <span className="text-white/90 font-medium">{query}</span>
            </div>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
                <FolderKanban className="w-4 h-4 text-blue-400" />
                Projects ({projects.length})
              </div>

              <div className="space-y-2">
                {projects.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-[#262729] px-4 py-3 text-sm text-white/35">No matching projects.</div>
                ) : (
                  projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}/${project.default_view}`}
                      className="flex items-center gap-3 rounded-xl border border-white/5 bg-[#262729] px-4 py-3 hover:bg-[#2d2e30] transition-colors"
                    >
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: project.color || "#6366f1" }} />
                      <span className="text-white/85 font-medium">{project.name}</span>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
                <CheckSquare className="w-4 h-4 text-emerald-400" />
                Tasks ({tasks.length})
              </div>

              <div className="space-y-2">
                {tasks.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-[#262729] px-4 py-3 text-sm text-white/35">No matching tasks.</div>
                ) : (
                  tasks.map((task) => (
                    <Link
                      key={task.id}
                      href={task.project_id ? `/projects/${task.project_id}/list?taskId=${task.id}` : task.client_id ? `/clients?clientId=${task.client_id}&taskId=${task.id}` : `/my-tasks?taskId=${task.id}`}
                      className="block rounded-xl border border-white/5 bg-[#262729] px-4 py-3 hover:bg-[#2d2e30] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-white/85 font-medium truncate">{task.title}</div>
                          <div className="text-xs text-white/35 mt-1 truncate">
                            {task.project?.name || task.client?.name || "Personal task"}
                          </div>
                        </div>
                        <div className="text-right text-xs text-white/35 shrink-0">
                          <div className="capitalize">{task.status.replace(/_/g, " ")}</div>
                          {task.due_date && <div>{format(new Date(task.due_date), "MMM d")}</div>}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
