import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getScopedGoals } from "@/lib/dashboard-data"
import { Target } from "lucide-react"

const statusStyles: Record<string, string> = {
  on_track: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  at_risk: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  off_track: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  achieved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
}

export default async function GoalsPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  const goals = userId ? await getScopedGoals(userId) : []

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto py-8 px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Goals</h1>
            <p className="text-sm text-gray-500 mt-1">Track progress toward company and team objectives</p>
          </div>
        </div>

        {goals.length === 0 ? (
          <div className="text-center py-20">
            <Target className="w-12 h-12 mx-auto text-gray-300 dark:text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">No goals yet</h3>
            <p className="text-sm text-gray-400 mt-2">Goals help your team stay aligned on what matters most.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {goals.map((goal) => {
              const progress = goal.target_value && goal.current_value
                ? Math.min(Math.round((goal.current_value / goal.target_value) * 100), 100)
                : 0

              return (
                <div key={goal.id} className="bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-xl p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">{goal.name}</h3>
                      {goal.description && <p className="text-sm text-gray-500 mt-1 line-clamp-1">{goal.description}</p>}
                      <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                        {goal.owner && <span>Owner: {goal.owner.full_name}</span>}
                        {goal.team && <><span>•</span><span>{goal.team.name}</span></>}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusStyles[goal.status] || "bg-gray-100 text-gray-500"}`}>
                      {goal.status.replace("_", " ")}
                    </span>
                  </div>
                  {goal.target_value && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>{goal.current_value ?? 0} / {goal.target_value}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
