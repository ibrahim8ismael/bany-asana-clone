import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Link from "next/link"
import { Bell, CheckCircle2, MessageSquare, Archive } from "lucide-react"
import { format } from "date-fns"
import InboxReadRefresher from "@/components/inbox-read-refresher"
import { getInboxFeed, type InboxFeedItem } from "@/lib/dashboard-data"
import { prisma } from "@/lib/prisma"

export default async function InboxPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  const unreadWhere = userId
    ? {
        user_id: userId,
        is_read: false,
        OR: [{ snoozed_until: null }, { snoozed_until: { lte: new Date() } }],
      }
    : null

  const hadUnread = unreadWhere ? await prisma.notification.count({ where: unreadWhere }) : 0

  if (unreadWhere && hadUnread > 0) {
    await prisma.notification.updateMany({
      where: unreadWhere,
      data: { is_read: true },
    })
  }

  const notifications = userId ? await getInboxFeed(userId) : []

  const iconMap = {
    notification: Bell,
    comment: MessageSquare,
    activity: CheckCircle2,
  } satisfies Record<InboxFeedItem["type"], typeof Bell>

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar">
      <InboxReadRefresher shouldRefresh={hadUnread > 0} />
      <div className="max-w-3xl mx-auto py-8 px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Inbox</h1>
            <p className="text-sm text-gray-500 mt-1">{notifications.length} notifications</p>
          </div>
          <div className="flex bg-gray-100 dark:bg-zinc-800 p-1 rounded-lg text-sm font-medium">
            <button className="px-4 py-1.5 bg-white dark:bg-zinc-700 shadow-sm rounded-md text-gray-900 dark:text-gray-100">Activity</button>
             <button className="px-4 py-1.5 text-gray-500 dark:text-gray-400 flex items-center gap-1.5 cursor-default opacity-70" disabled>
               <Archive className="w-3.5 h-3.5" />
               Archive soon
             </button>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="text-center py-20">
            <Bell className="w-12 h-12 mx-auto text-gray-300 dark:text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">All caught up!</h3>
            <p className="text-sm text-gray-400 mt-2">No new notifications right now.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const Icon = iconMap[n.type]
              return (
                <Link
                  key={n.id}
                  href={n.href || "/home"}
                  className="bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer flex gap-4 group"
                >
                  <div className="shrink-0 mt-0.5">
                    {n.avatar ? (
                      <img src={n.avatar} alt={n.actor} className="w-9 h-9 rounded-full" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                      <span className="font-semibold">{n.actor}</span>{" "}
                      <span className="text-gray-500">{n.message}</span>
                    </p>
                    {n.body && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-zinc-900 p-3 rounded-lg mt-2 border dark:border-zinc-800 line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">{format(new Date(n.time), "MMM d 'at' h:mm a")}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
