import type { Prisma } from "@prisma/client"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"

export const TASK_CARD_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  due_date: true,
  description_rich_text: true,
  assignee_id: true,
  creator_id: true,
  parent_task_id: true,
  reviewer_id: true,
  project_id: true,
  client_id: true,
  section_id: true,
  workspace_id: true,
  created_at: true,
  updated_at: true,
  archived: true,
  quality_required: true,
  quality_state: true,
  quality_score: true,
  first_quality_grade: true,
  final_quality_grade: true,
  rework_count: true,
  quality_blocker_count: true,
  assignee: {
    select: {
      id: true,
      full_name: true,
      email: true,
      avatar_url: true,
    },
  },
  project: {
    select: {
      id: true,
      name: true,
      color: true,
    },
  },
  client: {
    select: {
      id: true,
      name: true,
      color: true,
    },
  },
  tags: { include: { tag: true } },
  comments: { include: { author: { select: USER_PUBLIC_SELECT } } },
  subtasks: true,
  attachments: true,
} satisfies Prisma.TaskSelect
