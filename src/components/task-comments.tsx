"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { MessageSquare, Send, Trash2, User as UserIcon } from "lucide-react"
import { addComment, deleteComment } from "@/actions/comment-actions"
import { Button } from "@/components/ui/button"

interface CommentWithAuthor {
  id: string
  body_rich_text: string
  created_at: Date
  author: {
    id: string
    full_name: string
    avatar_url: string | null
  }
}

export default function TaskComments({ 
  taskId, 
  initialComments = [],
  currentUserId 
}: { 
  taskId: string; 
  initialComments: any[];
  currentUserId: string | null;
}) {
  const [comments, setComments] = useState<CommentWithAuthor[]>(initialComments)
  const [newComment, setNewComment] = useState("")
  const [loading, setLoading] = useState(false)

  const handleAddComment = async () => {
    if (!newComment.trim() || loading) return
    setLoading(true)
    
    const result = await addComment(taskId, newComment.trim())
    
    if (result.success && result.comment) {
      setComments((prev) => [...prev, result.comment as CommentWithAuthor])
      setNewComment("")
    }
    setLoading(false)
  }

  const handleDeleteComment = async (id: string) => {
    const result = await deleteComment(id)
    if (result.success) {
      setComments((prev) => prev.filter((c) => c.id !== id))
    }
  }

  return (
    <div className="space-y-6 pt-6 border-t border-white/5">
      <div className="flex items-center gap-2 text-white/50 px-1">
        <MessageSquare className="w-4 h-4" />
        <h3 className="text-sm font-bold uppercase tracking-wider">Comments</h3>
      </div>

      <div className="space-y-4">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3 group">
            <div className="shrink-0 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10 overflow-hidden">
              {comment.author.avatar_url ? (
                 
                <img src={comment.author.avatar_url} alt={comment.author.full_name} className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-4 h-4 text-white/40" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/90">{comment.author.full_name}</span>
                  <span className="text-[10px] text-white/20 capitalize font-medium">
                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                  </span>
                </div>
                {comment.author.id === currentUserId && (
                  <button 
                    onClick={() => handleDeleteComment(comment.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-white/20 hover:text-red-400 transition-all rounded hover:bg-red-500/10"
                    title="Delete comment"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-sm text-white/60 leading-relaxed bg-white/5 rounded-2xl px-4 py-2.5 inline-block">
                {comment.body_rich_text}
              </p>
            </div>
          </div>
        ))}

        {comments.length === 0 && (
          <div className="text-center py-6 border border-dashed border-white/10 rounded-2xl bg-white/5">
            <p className="text-xs text-white/25 italic">No comments yet. Start the conversation!</p>
          </div>
        )}
      </div>

      <div className="relative pt-2">
        <div className="flex gap-3">
          <div className="shrink-0 w-8 h-8 rounded-full bg-[#2a2b2d] border border-white/10 flex items-center justify-center">
             <MessageSquare className="w-4 h-4 text-white/30" />
          </div>
          <div className="flex-1 relative">
            <textarea
              className="w-full bg-[#2a2b2d] border border-white/10 rounded-2xl text-sm text-white/90 px-4 py-3 min-h-[90px] outline-none focus:border-blue-500/50 resize-none transition-all"
              placeholder="Ask a question or post an update..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                 if (e.key === "Enter" && e.ctrlKey) handleAddComment()
              }}
            />
            <div className="absolute bottom-2.5 right-2.5">
               <Button 
                onClick={handleAddComment}
                disabled={loading || !newComment.trim()}
                className="h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-xs font-semibold px-4 shadow-lg shadow-blue-600/10"
              >
                <Send className="w-3 h-3 mr-2" />
                {loading ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-white/15 px-12 italic">Tip: Press CTRL + Enter to post your comment.</p>
      </div>
    </div>
  )
}
