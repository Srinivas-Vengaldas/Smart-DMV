"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Range = "7d" | "30d" | "90d"

interface DailyPoint {
  label: string
  approved: number
  rejected: number
  pending: number
}

interface DocumentType {
  type: string
  count: number
  percentage: number
}

interface HourlyPoint {
  hour: string
  count: number
}

interface Insight {
  type: "success" | "warning" | "info"
  title: string
  description: string
}

interface AnalyticsData {
  summary: {
    total: number
    approved: number
    rejected: number
    approvalRate: number
    aiApproved: number
    staffApproved: number
    staffRejected: number
    timedOut: number
  }
  dailyTrend: DailyPoint[]
  documentTypes: DocumentType[]
  hourlyTraffic: HourlyPoint[]
  insights: Insight[]
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [range, setRange] = useState<Range>("7d")

  const loadAnalytics = useCallback(async (r: Range) => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/admin/analytics?range=${r}`, {
        credentials: "include",
        cache: "no-store",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to load analytics")
      setData(json)
    } catch (error) {
      console.error("Failed to load analytics:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAnalytics(range)
  }, [range, loadAnalytics])

  const maxDaily = data
    ? Math.max(...data.dailyTrend.map((d) => d.approved + d.rejected + d.pending), 1)
    : 1
  const maxHourly = data
    ? Math.max(...data.hourlyTraffic.map((h) => h.count), 1)
    : 1

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Detailed metrics and performance analysis of verification operations
        </p>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2">
        {(["7d", "30d", "90d"] as Range[]).map((r) => (
          <Badge
            key={r}
            variant={range === r ? "default" : "outline"}
            className={`cursor-pointer ${range === r ? "bg-primary text-primary-foreground" : ""}`}
            onClick={() => setRange(r)}
          >
            {r === "7d" ? "Last 7 Days" : r === "30d" ? "Last 30 Days" : "Last 90 Days"}
          </Badge>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      ) : !data ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-muted-foreground">Failed to load analytics data.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total Submitted", value: data.summary.total, color: "text-foreground", bg: "bg-primary/10" },
              { label: "Approved", value: data.summary.approved, color: "text-green-600", bg: "bg-green-100" },
              { label: "Rejected", value: data.summary.rejected, color: "text-red-600", bg: "bg-red-100" },
              { label: "Approval Rate", value: `${data.summary.approvalRate}%`, color: "text-foreground", bg: "bg-primary/10" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.bg}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* AI breakdown */}
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: "AI Auto-Approved", value: data.summary.aiApproved, color: "text-green-600" },
              { label: "Staff Approved", value: data.summary.staffApproved, color: "text-blue-600" },
              { label: "Staff Rejected", value: data.summary.staffRejected, color: "text-red-600" },
              { label: "AI Timed Out", value: data.summary.timedOut, color: "text-amber-600" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Daily trend bar chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Verification Trend</CardTitle>
              <CardDescription>
                Daily breakdown of verification activity over the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.dailyTrend.every((d) => d.approved + d.rejected + d.pending === 0) ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  No verifications submitted in this period
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-end justify-between gap-1 h-48">
                    {data.dailyTrend.map((day) => {
                      const total = day.approved + day.rejected + day.pending
                      const approvedH = (day.approved / maxDaily) * 160
                      const rejectedH = (day.rejected / maxDaily) * 160
                      const pendingH = (day.pending / maxDaily) * 160
                      return (
                        <div key={day.label} className="group flex flex-1 flex-col items-center gap-2">
                          <div className="relative flex w-full flex-col items-center">
                            {/* Tooltip */}
                            <div className="absolute -top-8 hidden group-hover:flex rounded bg-foreground px-2 py-1 text-[10px] text-background whitespace-nowrap z-10">
                              {total} total
                            </div>
                            <div className="flex w-full max-w-10 flex-col overflow-hidden rounded-sm">
                              {day.approved > 0 && (
                                <div className="w-full bg-green-500" style={{ height: `${approvedH}px` }} />
                              )}
                              {day.pending > 0 && (
                                <div className="w-full bg-amber-400" style={{ height: `${pendingH}px` }} />
                              )}
                              {day.rejected > 0 && (
                                <div className="w-full bg-red-400" style={{ height: `${rejectedH}px` }} />
                              )}
                              {total === 0 && (
                                <div className="w-full bg-muted" style={{ height: "4px" }} />
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] font-medium text-muted-foreground">{day.label}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded bg-green-500" />
                      <span className="text-xs text-muted-foreground">Approved</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded bg-amber-400" />
                      <span className="text-xs text-muted-foreground">Pending</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded bg-red-400" />
                      <span className="text-xs text-muted-foreground">Rejected</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Document type distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Document Type Distribution</CardTitle>
                <CardDescription>Breakdown by document category</CardDescription>
              </CardHeader>
              <CardContent>
                {data.documentTypes.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    No data in this period
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {data.documentTypes.map((doc) => (
                      <div key={doc.type} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{doc.type}</span>
                          <span className="text-sm text-muted-foreground">
                            {doc.count.toLocaleString()} ({doc.percentage}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${doc.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Hourly traffic */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Hourly Traffic Pattern</CardTitle>
                <CardDescription>Verification submissions by time of day</CardDescription>
              </CardHeader>
              <CardContent>
                {data.hourlyTraffic.every((h) => h.count === 0) ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    No traffic data in this period
                  </div>
                ) : (
                  <div className="flex items-end justify-between gap-1 h-40">
                    {data.hourlyTraffic.map((h) => (
                      <div key={h.hour} className="group flex flex-1 flex-col items-center gap-2">
                        <div className="relative flex w-full flex-col items-center">
                          <div className="absolute -top-6 hidden group-hover:flex rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background whitespace-nowrap z-10">
                            {h.count}
                          </div>
                          <div
                            className="w-full max-w-10 rounded-t bg-primary/80"
                            style={{ height: `${(h.count / maxHourly) * 120}px`, minHeight: h.count > 0 ? "3px" : "0" }}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground">{h.hour}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Key Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Key Insights</CardTitle>
              <CardDescription>Computed from real verification data in this period</CardDescription>
            </CardHeader>
            <CardContent>
              {data.insights.length === 0 ? (
                <p className="text-sm text-muted-foreground">No insights available for this period.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.insights.map((insight, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 rounded-lg border p-4 ${
                        insight.type === "success"
                          ? "border-green-200 bg-green-50"
                          : insight.type === "warning"
                            ? "border-amber-200 bg-amber-50"
                            : "border-blue-200 bg-blue-50"
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`mt-0.5 shrink-0 ${
                          insight.type === "success" ? "text-green-600" :
                          insight.type === "warning" ? "text-amber-600" : "text-blue-600"
                        }`}
                      >
                        {insight.type === "success" ? (
                          <><path d="m5 12 5 5L20 7"/></>
                        ) : insight.type === "warning" ? (
                          <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>
                        ) : (
                          <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></>
                        )}
                      </svg>
                      <div>
                        <p className={`text-sm font-medium ${
                          insight.type === "success" ? "text-green-800" :
                          insight.type === "warning" ? "text-amber-800" : "text-blue-800"
                        }`}>
                          {insight.title}
                        </p>
                        <p className={`text-xs ${
                          insight.type === "success" ? "text-green-700" :
                          insight.type === "warning" ? "text-amber-700" : "text-blue-700"
                        }`}>
                          {insight.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}