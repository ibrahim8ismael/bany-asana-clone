import { Skeleton } from "@/components/ui/skeleton"

function DashboardLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#18181b] p-4 sm:p-6">
      {/* Header skeleton */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full bg-[#27272a]" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32 bg-[#27272a]" />
            <Skeleton className="h-3 w-48 bg-[#27272a]" />
          </div>
        </div>
        <div className="flex items-center gap-3 border-b border-[#3f3f46] pb-4">
          <Skeleton className="h-6 w-20 bg-[#27272a]" />
          <Skeleton className="h-6 w-20 bg-[#27272a]" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex gap-4 sm:gap-6">
        {[1, 2, 3].map((col) => (
          <div key={col} className="w-[300px] shrink-0 rounded-xl border border-[#3f3f46] bg-[#202023] p-3">
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-3 w-24 bg-[#27272a]" />
              <Skeleton className="h-5 w-8 rounded-full bg-[#27272a]" />
            </div>
            <div className="space-y-2.5">
              {[1, 2, 3].map((card) => (
                <div key={card} className="rounded-lg border border-[#3f3f46] bg-[#202023] p-3">
                  <Skeleton className="mb-2 h-3 w-full bg-[#27272a]" />
                  <Skeleton className="mb-3 h-3 w-3/4 bg-[#27272a]" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-16 rounded bg-[#27272a]" />
                    <Skeleton className="h-4 w-4 rounded-full bg-[#27272a]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DashboardLoading
