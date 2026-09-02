import { Skeleton } from "@/components/ui/skeleton"

export default function RootLoading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-[#18181b]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#3f3f46] border-t-[#0075de]" />
        <p className="text-sm font-medium text-[#a1a1aa] animate-pulse">Loading...</p>
      </div>
    </div>
  )
}
