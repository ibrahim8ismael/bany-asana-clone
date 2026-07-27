"use server"

import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getAccessibleTaskContext } from "@/lib/permissions"
import { logActivity } from "@/lib/activity"
import { USER_PUBLIC_SELECT } from "@/lib/data-selects"

async function getSessionUserId() {
  const session = await getServerSession(authOptions)
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function addComment(taskId: string, bodyText: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const taskContext = await getAccessibleTaskContext(userId, taskId, "comment")
    if (!taskContext) return { error: "Not found or no permission to comment" }

    const comment = await prisma.comment.create({
      data: {
        task_id: taskId,
        author_id: userId,
        body_rich_text: bodyText,
      },
      include: {
        author: { select: USER_PUBLIC_SELECT },
      },
    })

    // Log activity
    await logActivity({
      workspaceId: taskContext.workspace_id,
      actorId: userId,
      entityType: "task",
      entityId: taskId,
      action: "comment_added",
      meta: {
        taskId,
        projectId: taskContext.project_id,
        clientId: taskContext.client_id,
        commentId: comment.id,
        bodyPreview: bodyText.slice(0, 50),
      },
    })

    revalidatePath("/my-tasks")
    if (taskContext.project_id) {
       revalidatePath(`/projects/${taskContext.project_id}/list`)
       revalidatePath(`/projects/${taskContext.project_id}/board`)
    }

    return { success: true, comment }
  } catch (error: unknown) {
    console.error("Failed to add comment:", error)
    return { error: "Failed to add comment" }
  }
}

export async function deleteComment(commentId: string) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return { error: "Unauthorized" }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { author_id: true, task_id: true },
    })

    if (!comment) return { error: "Comment not found" }
    if (comment.author_id !== userId) return { error: "Only the author can delete their comment" }

    await prisma.comment.delete({
      where: { id: commentId },
    })

    return { success: true }
  } catch (error: unknown) {
    console.error("Failed to delete comment:", error)
    return { error: "Failed to delete comment" }
  }
}
