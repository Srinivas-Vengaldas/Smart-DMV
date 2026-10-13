"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type DateRange = "today" | "week" | "month" | "all"
type ActiveTab = "bookings" | "verifications" | "templates"

interface AppointmentRow {
  id: string
  userName: string
  userEmail: string
  date: string
  time: string
  locationName: string
  status: string
  staffName: string | null
  bookedAt: string
}

interface VerificationRow {
  id: string
  caseNumber: string
  userName: string
  userEmail: string
  documentType: string
  status: string
  aiStatus: string
  aiConfidence: number
  submittedAt: string
  reviewedAt: string | null
  isException: boolean
}

interface ReportsData {
  appointments: {
    total: number
    completed: number
    scheduled: number
    cancelled: number
    noShow: number
    completionRate: number
    staffStats: { id: string; name: string; completed: number; noShow: number }[]
    locationStats: { name: string; count: number }[]
    recent: AppointmentRow[]
  }
  verifications: {
    total: number
    approved: number
    rejected: number
    pending: number
    aiApproved: number
    staffReview: number
    exceptions: number
    approvalRate: number
    reviewerStats: { id: string; name: string; approved: number; rejected: number }[]
    recent: VerificationRow[]
  }
}

const reportTemplates = [
  {
    id: "daily-summary",
    name: "Daily Summary Report",
    description: "Overview of daily verification activity and key metrics",
    frequency: "Daily",
    format: "CSV",
  },
  {
    id: "weekly-analytics",
    name: "Weekly Analytics Report",
    description: "Detailed analytics including trends and performance insights",
    frequency: "Weekly",
    format: "CSV",
  },
  {
    id: "monthly-compliance",
    name: "Monthly Compliance Report",
    description: "Compliance status, audit logs, and regulatory adherence",
    frequency: "Monthly",
    format: "CSV",
  },
  {
    id: "booking-report",
    name: "Booking Activity Report",
    description: "Appointment bookings, completions, and staff handling metrics",
    frequency: "On-demand",
    format: "CSV",
  },
  {
    id: "verification-audit",
    name: "Verification Audit Trail",
    description: "Complete audit trail of all verification decisions",
    frequency: "On-demand",
    format: "CSV",
  },
]

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>("week")
  const [activeTab, setActiveTab] = useState<ActiveTab>("bookings")

  const loadData = useCallback(async (range: DateRange, silent = false) => {
    try {
      if (silent) setIsRefreshing(true)
      else setIsLoading(true)

      const res = await fetch(`/api/admin/reports?range=${range}`, {
        credentials: "include",
        cache: "no-store",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to load reports")
      setData(json)
    } catch (error) {
      console.error("Failed to load reports:", error)
    } finally {
      if (silent) setIsRefreshing(false)
      else setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(dateRange)
  }, [dateRange, loadData])

  const handleExportAppointments = () => {
    if (!data) return
    const headers = ["ID", "Resident", "Email", "Date", "Time", "Location", "Status", "Handled By", "Booked At"]
    const rows = data.appointments.recent.map((a) => [
      a.id, a.userName, a.userEmail,
      new Date(a.date).toLocaleDateString(),
      a.time, a.locationName, a.status,
      a.staffName || "-",
      new Date(a.bookedAt).toLocaleString(),
    ])
    downloadCsv("appointments-report.csv", [headers, ...rows])
  }

  const handleExportVerifications = () => {
    if (!data) return
    const headers = ["Case Number", "Resident", "Email", "Document Type", "Status", "AI Status", "AI Confidence", "Submitted At", "Reviewed At", "Exception"]
    const rows = data.verifications.recent.map((v) => [
      v.caseNumber, v.userName, v.userEmail, v.documentType,
      v.status, v.aiStatus, `${Math.round(v.aiConfidence * 100)}%`,
      new Date(v.submittedAt).toLocaleString(),
      v.reviewedAt ? new Date(v.reviewedAt).toLocaleString() : "-",
      v.isException ? "Yes" : "No",
    ])
    downloadCsv("verifications-report.csv", [headers, ...rows])
  }

  const handleTemplateExport = (templateId: string) => {
    if (!data) return
    if (templateId === "booking-report") { handleExportAppointments(); return }
    if (templateId === "verification-audit") { handleExportVerifications(); return }

    // For other templates, export a combined summary
    const headers = ["Metric", "Value"]
    const rows = [
      ["Date Range", dateRange],
      ["Total Appointments", String(data.appointments.total)],
      ["Completed Appointments", String(data.appointments.completed)],
      ["Cancelled Appointments", String(data.appointments.cancelled)],
      ["Completion Rate", `${data.appointments.completionRate}%`],
      ["Total Verifications", String(data.verifications.total)],
      ["Approved Verifications", String(data.verifications.approved)],
      ["Rejected Verifications", String(data.verifications.rejected)],
      ["AI Auto-Approved", String(data.verifications.aiApproved)],
      ["Staff Reviews", String(data.verifications.staffReview)],
      ["Exceptions Flagged", String(data.verifications.exceptions)],
      ["Approval Rate", `${data.verifications.approvalRate}%`],
    ]
    downloadCsv(`${templateId}-report.csv`, [headers, ...rows])
  }

  const appt = data?.appointments
  const verif = data?.verifications

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Real-time operational reports from live data
          </p>
          {isRefreshing && <p className="text-xs text-muted-foreground">Refreshing…</p>}
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 Days</SelectItem>
            <SelectItem value="month">Last 30 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {(["bookings", "verifications", "templates"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "bookings" ? "Booking Reports" :
             tab === "verifications" ? "Verification Reports" :
             "Templates"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading reports...</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Booking Reports Tab ──────────────────────────────── */}
          {activeTab === "bookings" && appt && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { label: "Total Bookings", value: appt.total, color: "text-foreground", bg: "bg-primary/10", iconColor: "text-primary" },
                  { label: "Completed", value: appt.completed, color: "text-green-600", bg: "bg-green-100", iconColor: "text-green-600" },
                  { label: "Scheduled", value: appt.scheduled, color: "text-blue-600", bg: "bg-blue-100", iconColor: "text-blue-600" },
                  { label: "Cancelled", value: appt.cancelled, color: "text-muted-foreground", bg: "bg-muted", iconColor: "text-muted-foreground" },
                  { label: "Completion Rate", value: `${appt.completionRate}%`, color: "text-foreground", bg: "bg-primary/10", iconColor: "text-primary" },
                ].map((stat) => (
                  <Card key={stat.label}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                      </div>
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={stat.iconColor}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Staff Performance */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Staff Performance</CardTitle>
                    <CardDescription>Appointments handled by staff members</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {appt.staffStats.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <p className="text-sm text-muted-foreground">No staff activity in this period</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {appt.staffStats.map((staff) => (
                          <div key={staff.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                                {staff.name.split(" ").map((n) => n[0]).join("").toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{staff.name}</p>
                                <p className="text-xs text-muted-foreground">Staff Member</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-center">
                                <p className="text-lg font-bold text-green-600">{staff.completed}</p>
                                <p className="text-[10px] text-muted-foreground">Completed</p>
                              </div>
                              <div className="text-center">
                                <p className="text-lg font-bold text-red-500">{staff.noShow}</p>
                                <p className="text-[10px] text-muted-foreground">No-Show</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Bookings by Location */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Bookings by Location</CardTitle>
                    <CardDescription>Distribution across DC DMV locations</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {appt.locationStats.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <p className="text-sm text-muted-foreground">No location data in this period</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {appt.locationStats.map((loc) => (
                          <div key={loc.name} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{loc.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="h-2 w-24 rounded-full bg-muted">
                                <div
                                  className="h-2 rounded-full bg-primary"
                                  style={{
                                    width: `${Math.min((loc.count / Math.max(...appt.locationStats.map((l) => l.count))) * 100, 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-sm font-semibold">{loc.count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recent Bookings Table */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Recent Bookings</CardTitle>
                    <CardDescription>Showing up to 50 most recent bookings in period</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportAppointments} disabled={appt.recent.length === 0}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  {appt.recent.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-sm text-muted-foreground">No bookings in this period</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            {["Resident", "Date", "Location", "Status", "Handled By"].map((h) => (
                              <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {appt.recent.map((a) => (
                            <tr key={a.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-2">
                                <p className="text-sm font-medium">{a.userName}</p>
                                <p className="text-xs text-muted-foreground">{a.userEmail}</p>
                              </td>
                              <td className="px-3 py-2">
                                <p className="text-sm">{new Date(a.date).toLocaleDateString()}</p>
                                <p className="text-xs text-muted-foreground">{a.time}</p>
                              </td>
                              <td className="px-3 py-2 text-sm">{a.locationName}</td>
                              <td className="px-3 py-2">
                                <Badge className={
                                  a.status === "completed" ? "bg-green-100 text-green-700 hover:bg-green-100" :
                                  a.status === "scheduled" ? "bg-blue-100 text-blue-700 hover:bg-blue-100" :
                                  a.status === "no_show" || a.status === "no-show" ? "bg-red-100 text-red-700 hover:bg-red-100" :
                                  "bg-muted text-muted-foreground"
                                }>
                                  {a.status}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-sm text-muted-foreground">{a.staffName || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Verification Reports Tab ─────────────────────────── */}
          {activeTab === "verifications" && verif && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Total Submitted", value: verif.total, color: "text-foreground", bg: "bg-primary/10" },
                  { label: "Approved", value: verif.approved, color: "text-green-600", bg: "bg-green-100" },
                  { label: "Rejected", value: verif.rejected, color: "text-red-600", bg: "bg-red-100" },
                  { label: "Approval Rate", value: `${verif.approvalRate}%`, color: "text-foreground", bg: "bg-primary/10" },
                ].map((stat) => (
                  <Card key={stat.label}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                      </div>
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">AI Auto-Approved</p>
                    <p className="text-2xl font-bold text-green-600">{verif.aiApproved}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Sent to Staff Review</p>
                    <p className="text-2xl font-bold text-amber-600">{verif.staffReview}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Exceptions Flagged</p>
                    <p className="text-2xl font-bold text-red-600">{verif.exceptions}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Reviewer Performance */}
              {verif.reviewerStats.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Reviewer Performance</CardTitle>
                    <CardDescription>Staff decisions in this period</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-3">
                      {verif.reviewerStats.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                              {r.name.split(" ").map((n) => n[0]).join("").toUpperCase()}
                            </div>
                            <p className="text-sm font-medium">{r.name}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <p className="text-lg font-bold text-green-600">{r.approved}</p>
                              <p className="text-[10px] text-muted-foreground">Approved</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-bold text-red-500">{r.rejected}</p>
                              <p className="text-[10px] text-muted-foreground">Rejected</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent Verifications Table */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Recent Verifications</CardTitle>
                    <CardDescription>Showing up to 50 most recent in period</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportVerifications} disabled={verif.recent.length === 0}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  {verif.recent.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-sm text-muted-foreground">No verifications in this period</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            {["Case", "Resident", "Document", "Status", "AI", "Confidence", "Submitted"].map((h) => (
                              <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {verif.recent.map((v) => (
                            <tr key={v.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-2 text-xs font-mono text-primary">{v.caseNumber || "—"}</td>
                              <td className="px-3 py-2">
                                <p className="text-sm font-medium">{v.userName}</p>
                                <p className="text-xs text-muted-foreground">{v.userEmail}</p>
                              </td>
                              <td className="px-3 py-2 text-sm">{v.documentType}</td>
                              <td className="px-3 py-2">
                                <Badge className={
                                  v.status === "approved" ? "bg-green-100 text-green-700 hover:bg-green-100" :
                                  v.status === "rejected" ? "bg-red-100 text-red-700 hover:bg-red-100" :
                                  "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                }>
                                  {v.status}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                <Badge className={
                                  v.aiStatus === "APPROVED_BY_AI" ? "bg-green-100 text-green-700 hover:bg-green-100" :
                                  v.aiStatus === "REJECTED_BY_STAFF" ? "bg-red-100 text-red-700 hover:bg-red-100" :
                                  v.aiStatus === "TIMED_OUT" ? "bg-orange-100 text-orange-700 hover:bg-orange-100" :
                                  "bg-muted text-muted-foreground"
                                }>
                                  {v.aiStatus.replace(/_/g, " ")}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-sm font-medium">
                                <span className={
                                  v.aiConfidence >= 0.8 ? "text-green-600" :
                                  v.aiConfidence >= 0.6 ? "text-amber-600" :
                                  "text-red-600"
                                }>
                                  {Math.round(v.aiConfidence * 100)}%
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {new Date(v.submittedAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Templates Tab ────────────────────────────────────── */}
          {activeTab === "templates" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Report Templates</CardTitle>
                <CardDescription>Generate and download pre-configured reports as CSV</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {reportTemplates.map((report) => (
                    <div key={report.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                        </div>
                        <Badge variant="outline" className="text-xs">{report.format}</Badge>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">{report.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{report.description}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{report.frequency}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5"
                        onClick={() => handleTemplateExport(report.id)}
                        disabled={!data}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download CSV
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}