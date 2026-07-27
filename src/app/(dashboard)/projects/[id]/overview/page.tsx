import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { parseActivityMeta } from "@/lib/activity"
import { projectAccessWhere } from "@/lib/permissions"
import ProjectMembersManager from "@/components/project-members-manager"
import ProjectQualityPolicySettings from "@/components/project-quality-policy-settings"
import ProjectViewTabs from "@/components/project-view-tabs"
import ShareButton from "@/components/share-button"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"
import {
  Activity, 
  FileText,
  MessageSquare,
  Layers,
  Target,
  ChevronRight
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

type ProjectActivityItem = {
  action: string
  meta_json: string | null
  actor: { full_name: string } | null
}

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return <div>Project not found</div>

  const project = await prisma.project.findFirst({
    where: { id, ...projectAccessWhere(userId) },
    include: {
      members: { include: { user: { select: USER_PUBLIC_SELECT } } },
      default_reviewer: { select: USER_PUBLIC_SELECT },
      workspace: true,
      tasks: { take: 5, orderBy: { updated_at: "desc" }, include: { assignee: { select: USER_PUBLIC_SELECT } } }
    }
  })

  if (!project) return <div>Project not found</div>

  const canManageProject = Boolean(
    await prisma.project.findFirst({
      where: { id, ...projectAccessWhere(userId, "manage") },
      select: { id: true },
    })
  )

  const workspaceMembers = canManageProject
    ? await prisma.workspaceMember.findMany({
        where: { workspace_id: project.workspace_id, role: { not: "guest" } },
        select: {
          user: {
            select: {
              id: true,
              full_name: true,
              email: true,
              avatar_url: true,
            },
          },
        },
        orderBy: { joined_at: "asc" },
      })
    : []

  const projectActivity = await prisma.activityLog.findMany({
    where: {
      workspace_id: project.workspace_id,
      entity_type: "project",
      entity_id: project.id,
    },
    include: { actor: { select: USER_PUBLIC_SELECT } },
    orderBy: { created_at: "desc" },
    take: 12,
  })

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[#1e1f21] custom-scrollbar">
      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
        <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-[-0.03em] text-white/95 sm:text-2xl">{project.name}</h1>
            <p className="text-white/40 mt-1">Summary, recent activity, and team context.</p>
          </div>
          <ShareButton className="h-11 shrink-0 rounded-md border border-white/10 px-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 sm:h-9" />
        </div>
        <ProjectViewTabs projectId={project.id} clientId={project.client_id} />
        
        {/* Project Header Info */}
        <div className="space-y-4">
           <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#505155] bg-[#2a2b2d]">
               <span className="text-xl">{project.icon || "📋"}</span>
             </div>
              <h2 className="text-xl font-semibold text-white/90">Project snapshot</h2>
           </div>
          <p className="text-white/40 max-w-2xl leading-relaxed">
            {project.description || "No description provided for this project. Start by adding goals and resources to help your team stay aligned."}
          </p>
          {project.deadline ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/65">
              <ChevronRight className="h-3.5 w-3.5 text-orange-300" />
              Deadline {format(new Date(project.deadline), "MMM d, yyyy")}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          
          {/* Main Content */}
          <div className="space-y-8 lg:col-span-2">
            
            {/* Goals/Status Section */}
             <section className="space-y-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white/55">
                 <Target className="w-4 h-4" />
                 Project Status
               </h3>
                 <div className="flex flex-col gap-4 rounded-lg border border-[#47484b] bg-[#2a2b2d] p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
                   <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center font-bold text-lg ${project.status === "complete" ? "border-emerald-500/20 border-t-emerald-500 text-emerald-400" : project.status === "in_progress" ? "border-blue-500/20 border-t-blue-500 text-blue-400" : "border-white/10 border-t-white/50 text-white/70"}`}>
                     {project.status === "in_progress" ? "Active" : project.status === "complete" ? "Done" : "To Do"}
                   </div>
                   <div className="space-y-1">
                     <h4 className="text-white/90 font-medium font-bold">Project status is {project.status.replace("_", " ")}</h4>
                     <p className="text-sm text-white/40">Completion is driven automatically when every task is done. Reopened work will move the project out of done.</p>
                   </div>
                </div>
             </section>

            {/* Recent Activity */}
             <section className="space-y-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white/55">
                 <Activity className="w-4 h-4" />
                 Recent Activity
               </h3>
               <div className="space-y-4">
                 {projectActivity.length === 0 ? (
                   <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/25">
                     No project-level activity yet.
                   </div>
                 ) : (
                   projectActivity.map((entry) => (
                      <div key={entry.id} className="flex gap-4 rounded-md border-b border-[#414245] px-2 py-4 transition-colors last:border-b-0 hover:bg-white/[0.03]">
                       <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                         <FileText className="w-4 h-4" />
                       </div>
                       <div className="space-y-1">
                         <p className="text-sm text-white/80">{describeProjectActivity(entry)}</p>
                         <div className="flex items-center gap-2 text-xs text-white/20">
                           <span>{entry.actor?.full_name || "Someone"}</span>
                           <span>•</span>
                           <span>{format(new Date(entry.created_at), "MMM d, h:mm a")}</span>
                         </div>
                       </div>
                     </div>
                   ))
                 )}
               </div>
            </section>

          </div>

          {/* Sidebar Info */}
          <div className="space-y-8 border-t border-[#414245] pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <ProjectQualityPolicySettings
              projectId={project.id}
              initialPolicy={project.quality_policy as "off" | "optional" | "required"}
              initialDefaultReviewerId={project.default_reviewer_id}
              initialReviewSlaDays={project.review_sla_days}
              reviewers={canManageProject
                ? workspaceMembers.map((membership) => membership.user)
                : project.default_reviewer ? [project.default_reviewer] : []}
              canManage={canManageProject}
            />
             
            <ProjectMembersManager
              projectId={project.id}
              canManage={canManageProject}
              members={project.members}
              workspaceMembers={workspaceMembers.map((membership) => membership.user)}
            />

            {/* Resources */}
             <section className="space-y-4">
                <h3 className="text-sm font-semibold text-white/55">Resources</h3>
               <div className="space-y-2">
                  <ResourceItem label="Project Brief" icon={FileText} />
                  <ResourceItem label="Design Specs" icon={Layers} />
                  <ResourceItem label="Meeting Notes" icon={MessageSquare} />
                   <div className="w-full py-2 border border-dashed border-white/5 rounded-lg text-xs text-white/20 text-center font-bold mt-2">
                     Resource links coming soon
                   </div>
               </div>
            </section>

          </div>

        </div>

      </div>
    </div>
  )
}

function describeProjectActivity(activity: ProjectActivityItem) {
  const actor = activity.actor?.full_name || "Someone"
  const meta = parseActivityMeta<Record<string, string | null | undefined>>(activity.meta_json)

  switch (activity.action) {
    case "project_created":
      return `${actor} created the project`
    case "project_name_changed":
      return `${actor} renamed the project`
    case "project_description_changed":
      return `${actor} updated the project description`
    case "project_deadline_changed":
      return `${actor} updated the project deadline${meta?.to ? ` to ${format(new Date(meta.to), "MMM d, yyyy")}` : ""}`
    case "project_status_changed":
      return `${actor} changed the project status${meta?.to ? ` to ${meta.to}` : ""}`
    case "project_task_added":
      return `${actor} added task${meta?.title ? ` ${meta.title}` : ""}`
    case "project_task_removed":
      return `${actor} removed task${meta?.title ? ` ${meta.title}` : ""}`
    case "project_member_added":
      return `${actor} added ${meta?.memberName ? `${meta.memberName} ` : "a member "}to the project${meta?.to ? ` as ${meta.to}` : ""}`
    case "project_member_role_changed":
      return `${actor} changed ${meta?.memberName ? `${meta.memberName}'s` : "a member's"} role${meta?.to ? ` to ${meta.to}` : ""}`
    case "project_member_removed":
      return `${actor} removed ${meta?.memberName ? meta.memberName : "a member"} from the project`
    case "project_quality_policy_changed":
      return `${actor} updated the project quality policy${meta?.policy ? ` to ${meta.policy}` : ""}`
    case "section_created":
      return `${actor} created a section${meta?.sectionName ? `: ${meta.sectionName}` : ""}`
    case "section_deleted":
      return `${actor} deleted a section`
    default:
      return `${actor} updated the project`
  }
}

function ResourceItem({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group">
       <Icon className="w-4 h-4 text-white/20 group-hover:text-white/40" />
       <span className="text-xs text-white/60 group-hover:text-white/80">{label}</span>
    </div>
  )
}
