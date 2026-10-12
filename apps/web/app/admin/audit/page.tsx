"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type AuditStatus = "success" | "failed"
type AuditCategory = "login" | "document" | "user" | "config" | "report" | "system"
type AuditFilter = "all" | AuditCategory | "security"

interface AuditLogItem {
  id: string
  action: string
  actor: string
  target: string
  timestamp: string
  ip: string
  status: AuditStatus
  category: AuditCategory
}

interface AuditSummary {
  totalEvents: number
  successfulEvents: number
  failedEvents: number
  securityAlerts: number
}

const filters: AuditFilter[] = [
  "all",
  "login",
  "document",
  "user",
  "config",
  "report",
  "system",
  "security",
]

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    )
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

function isSecurityLog(log: AuditLogItem) {
  return (
    log.status === "failed" &&
    (log.category === "login" || log.category === "system" || log.action.toLowerCase().includes("exception"))
  )
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [summary, setSummary] = useState<AuditSummary>({
    totalEvents: 0,
    successfulEvents: 0,
    failedEvents: 0,
    securityAlerts: 0,
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<AuditFilter>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pageError, setPageError] = useState("")

  const loadAuditLogs = async (silent = false) => {
    try {
      if (silent) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }

      setPageError("")

      const res = await fetch("/api/admin/audit", {
        credentials: "include",
        cache: "no-store",
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load audit logs")
      }

      setLogs(Array.isArray(data?.logs) ? data.logs : [])
      setSummary(
        data?.summary || {
          totalEvents: 0,
          successfulEvents: 0,
          failedEvents: 0,
          securityAlerts: 0,
        }
      )
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load audit logs")
      if (!silent) {
        setLogs([])
        setSummary({
          totalEvents: 0,
          successfulEvents: 0,
          failedEvents: 0,
          securityAlerts: 0,
        })
      }
    } finally {
      if (silent) {
        setIsRefreshing(false)
      } else {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    loadAuditLogs(false)

    const interval = setInterval(() => {
      loadAuditLogs(true)
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch =
        q === "" ||
        log.action.toLowerCase().includes(q) ||
        log.actor.toLowerCase().includes(q) ||
        log.target.toLowerCase().includes(q) ||
        log.id.toLowerCase().includes(q) ||
        log.ip.toLowerCase().includes(q)

      let matchesFilter = true

      if (activeFilter === "security") {
        matchesFilter = isSecurityLog(log)
      } else if (activeFilter !== "all") {
        matchesFilter = log.category === activeFilter
      }

      return matchesSearch && matchesFilter
    })
  }, [logs, searchQuery, activeFilter])

  const handleExport = () => {
    const headers = [
      "Audit ID",
      "Action",
      "Category",
      "Actor",
      "Target",
      "IP Address",
      "Status",
      "Timestamp",
    ]

    const rows = filteredLogs.map((log) => [
      log.id,
      log.action,
      log.category,
      log.actor,
      log.target,
      log.ip,
      log.status,
      new Date(log.timestamp).toLocaleString(),
    ])

    downloadCsv("audit-log-report.csv", [headers, ...rows])
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">
            Track all system activities, user actions, and security events
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isRefreshing && (
            <span className="text-xs text-muted-foreground">Refreshing…</span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadAuditLogs(false)}
            disabled={isLoading || isRefreshing}
          >
            Refresh
          </Button>
        </div>
      </div>

      {pageError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {pageError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </div>
            <div>
              <p className="text-xl font-bold">{summary.totalEvents}</p>
              <p className="text-xs text-muted-foreground">Total Events</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div>
              <p className="text-xl font-bold">{summary.successfulEvents}</p>
              <p className="text-xs text-muted-foreground">Successful</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <div>
              <p className="text-xl font-bold">{summary.failedEvents}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            </div>
            <div>
              <p className="text-xl font-bold">{summary.securityAlerts}</p>
              <p className="text-xs text-muted-foreground">Security Alerts</p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {filters.map((filter) => (
                <Badge
                  key={filter}
                  variant={activeFilter === filter ? "default" : "outline"}
                  className="cursor-pointer capitalize"
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-9"
                />
              </div>

              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={handleExport}
                disabled={filteredLogs.length === 0}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity Log</CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading audit logs..."
              : `${filteredLogs.length} event${filteredLogs.length !== 1 ? "s" : ""} found`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Loading audit logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
              <p className="mt-4 text-sm text-muted-foreground">No audit logs found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
                    log.status === "failed" ? "border-red-200 bg-red-50" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        log.status === "success" ? "bg-green-100" : "bg-red-100"
                      }`}
                    >
                      {log.status === "success" ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      )}
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{log.action}</span>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{log.actor}</span>
                        <span>→</span>
                        <span>{log.target}</span>
                        <Badge variant="outline" className="capitalize">
                          {log.category}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{log.ip}</span>
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                    <span className="font-mono text-muted-foreground/70">{log.id}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}