import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { parseActivityMeta } from "@/lib/activity"
import { isSuperAdminUser, projectAccessWhere } from "@/lib/permissions"
import { effectiveProjectRole, type ProjectRole, type WorkspaceRole } from "@/lib/project-membership"
import ProjectMembersManager from "@/components/project-members-manager"
import ProjectAccessDenied from "@/components/project-access-denied"
import { notFound } from "next/navigation"
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

  const isSuperAdmin = await isSuperAdminUser(userId)
  const project = await prisma.project.findFirst({
    where: { id, ...projectAccessWhere(userId, "view", isSuperAdmin) },
    include: {
      members: { include: { user: { select: USER_PUBLIC_SELECT } } },
      default_reviewer: { select: USER_PUBLIC_SELECT },
      workspace: true,
      tasks: { take: 5, orderBy: { updated_at: "desc" }, include: { assignee: { select: USER_PUBLIC_SELECT } } }
    }
  })

  if (!project) {
    if (id !== "demo") {
      const existingProject = await prisma.project.findUnique({ where: { id } })
      if (existingProject) {
        return <ProjectAccessDenied projectId={id} projectName={existingProject.name} />
      }
    }
    return notFound()
  }

  const canManageProject = Boolean(
    await prisma.project.findFirst({
      where: { id, ...projectAccessWhere(userId, "manage", isSuperAdmin) },
      select: { id: true },
    })
  )

  const workspaceMembers = canManageProject
    ? await prisma.workspaceMember.findMany({
        where: { workspace_id: project.workspace_id, role: { in: ["owner", "admin", "member"] } },
        select: {
          role: true,
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
    <div className="h-full min-h-0 overflow-y-auto bg-[#18181b] custom-scrollbar">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
        <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-[#f4f4f5] sm:text-2xl">{project.name}</h1>
            <p className="text-xs text-[#a1a1aa] mt-1">Summary, recent activity, and team context.</p>
          </div>
          <ShareButton className="h-9 shrink-0 rounded-full border border-[#3f3f46] bg-[#202023] px-3.5 text-xs font-semibold text-[#f4f4f5] transition-colors hover:bg-[#27272a]" />
        </div>
        <ProjectViewTabs projectId={project.id} clientId={project.client_id} />
        
        {/* Project Header Info */}
        <div className="rounded-xl border border-[#3f3f46] bg-[#202023] p-6 space-y-4">
           <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#3f3f46] bg-[#18181b]">
               <span className="text-xl">{project.icon || "📋"}</span>
             </div>
              <h2 className="text-lg font-bold text-[#f4f4f5]">Project snapshot</h2>
           </div>
          <p className="text-xs text-[#a1a1aa] max-w-2xl leading-relaxed">
            {project.description || "No description provided for this project. Start by adding goals and resources to help your team stay aligned."}
          </p>
          {project.deadline ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[#0075de]/30 bg-[#0075de]/10 px-3 py-1 text-xs font-semibold text-[#60a5fa]">
              <ChevronRight className="h-3.5 w-3.5 text-[#0075de]" />
              Deadline: {format(new Date(project.deadline), "MMM d, yyyy")}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          
          {/* Main Content */}
          <div className="space-y-6 lg:col-span-2">
            
            {/* Goals/Status Section */}
             <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">
                 <Target className="w-4 h-4 text-[#0075de]" />
                 Project Status
               </h3>
                 <div className="flex flex-col gap-4 rounded-xl border border-[#3f3f46] bg-[#202023] p-5 sm:flex-row sm:items-center sm:gap-6">
                   <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center font-bold text-xs shrink-0 ${project.status === "complete" ? "border-emerald-500/20 border-t-emerald-500 text-emerald-400" : project.status === "in_progress" ? "border-[#0075de]/30 border-t-[#0075de] text-[#60a5fa]" : "border-[#3f3f46] text-[#a1a1aa]"}`}>
                     {project.status === "in_progress" ? "Active" : project.status === "complete" ? "Done" : "To Do"}
                   </div>
                   <div className="space-y-1">
                     <h4 className="text-sm font-bold text-[#f4f4f5]">Project status is {project.status.replace("_", " ")}</h4>
                     <p className="text-xs text-[#a1a1aa] leading-relaxed">Completion is driven automatically when every task is done. Reopened work will move the project out of done.</p>
                   </div>
                </div>
             </section>

            {/* Recent Activity */}
             <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">
                 <Activity className="w-4 h-4 text-[#0075de]" />
                 Recent Activity
               </h3>
               <div className="rounded-xl border border-[#3f3f46] bg-[#202023] divide-y divide-[#3f3f46] overflow-hidden">
                 {projectActivity.length === 0 ? (
                   <div className="px-4 py-8 text-center text-xs text-[#a1a1aa]">
                     No project-level activity yet.
                   </div>
                 ) : (
                   projectActivity.map((entry) => (
                      <div key={entry.id} className="flex gap-3 px-4 py-3.5 transition-colors hover:bg-[#27272a]">
                       <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0075de]/10 text-[#60a5fa]">
                         <FileText className="w-3.5 h-3.5" />
                       </div>
                       <div className="space-y-1">
                         <p className="text-xs text-[#f4f4f5]">{describeProjectActivity(entry)}</p>
                         <div className="flex items-center gap-2 text-[10px] text-[#a1a1aa]">
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
          <div className="space-y-6">
            <ProjectQualityPolicySettings
              projectId={project.id}
              initialPolicy={project.quality_policy as "off" | "optional" | "required"}
              initialDefaultReviewerId={project.default_reviewer_id}
              initialReviewSlaDays={project.review_sla_days}
              reviewers={canManageProject
                ? project.members.map((membership) => membership.user)
                : project.default_reviewer ? [project.default_reviewer] : []}
              canManage={canManageProject}
            />
             
            <ProjectMembersManager
              projectId={project.id}
              canManage={canManageProject}
              canTransferOwnership={canManageProject && (project.owner_id === userId || isSuperAdmin)}
              ownerId={project.owner_id}
              members={project.members.map((member) => ({
                ...member,
                role: member.role as ProjectRole,
                effectiveRole: effectiveProjectRole({
                  userId: member.user.id,
                  ownerId: project.owner_id,
                  membershipRole: member.role,
                }) || "member",
                isOwner: member.user.id === project.owner_id,
              }))}
              workspaceMembers={workspaceMembers.map((membership) => ({
                ...membership.user,
                workspaceRole: membership.role as WorkspaceRole,
              }))}
            />

            {/* Resources */}
             <section className="space-y-3 rounded-xl border border-[#3f3f46] bg-[#202023] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Resources</h3>
               <div className="space-y-1">
                  <ResourceItem label="Project Brief" icon={FileText} />
                  <ResourceItem label="Design Specs" icon={Layers} />
                  <ResourceItem label="Meeting Notes" icon={MessageSquare} />
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
    case "project_owner_transferred":
      return `${actor} transferred project ownership${meta?.toName ? ` to ${meta.toName}` : ""}`
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
