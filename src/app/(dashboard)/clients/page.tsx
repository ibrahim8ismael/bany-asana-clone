import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getScopedClients } from "@/lib/dashboard-data"
import ClientsOverviewClient from "@/components/clients-overview-client"

export default async function ClientsPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  const clients = userId ? await getScopedClients(userId) : []

  return <ClientsOverviewClient initialClients={clients} />
}
