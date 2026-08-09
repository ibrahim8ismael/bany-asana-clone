import Link from "next/link"
import { Lock, ArrowLeft, Send } from "lucide-react"

export default function ProjectAccessDenied({ 
  projectName 
}: { 
  projectId: string, 
  projectName: string 
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#09090b] px-6 py-20 text-center">
      <div className="relative">
        <div className="absolute -inset-10 animate-pulse rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-[#27272a] bg-[#18181b] shadow-2xl">
          <Lock className="h-10 w-10 text-amber-500" />
        </div>
      </div>
      <h2 className="mt-10 text-3xl font-bold tracking-tight text-white sm:text-4xl">Private Project</h2>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[#a1a1aa]">
        This project "<span className="font-semibold text-white">{projectName}</span>" is private. 
        You don't currently have access to view its contents or tasks.
      </p>
      
      <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
        <button className="group flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-transform hover:scale-[1.02] active:scale-95">
          <Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          Request Access
        </button>
        <Link 
          href="/clients" 
          className="flex w-full items-center justify-center gap-2 rounded-full border border-[#3f3f46] bg-[#18181b] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#27272a]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </Link>
      </div>
    </div>
  )
}
