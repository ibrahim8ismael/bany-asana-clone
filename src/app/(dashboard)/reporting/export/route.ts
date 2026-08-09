import { format } from "date-fns"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { stringifyCsv } from "@/lib/csv"
import { getReportingData } from "@/lib/reporting-data"
import { buildReportingCsvRows, REPORTING_CSV_HEADERS } from "@/lib/reporting-metrics"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id

  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const data = await getReportingData(userId, new URL(request.url).searchParams)

  if (!data) {
    return new Response("Report not found", { status: 404 })
  }

  const csv = stringifyCsv(REPORTING_CSV_HEADERS, buildReportingCsvRows(data))
  const filename = `kpi-report-${format(new Date(), "yyyy-MM-dd")}.csv`

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
