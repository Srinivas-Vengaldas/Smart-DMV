"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"

type ServiceStatus = "operational" | "degraded" | "down"

interface ServiceItem {
  name: string
  status: ServiceStatus
  uptime: number
  latency: number
}

interface IncidentItem {
  date: string
  title: string
  duration: string
  status: "resolved" | "completed" | "investigating"
}

interface ResourceUsage {
  cpu: number
  memory: number
  storage: number
  network: number
}

interface SystemStatusResponse {
  success: boolean
  summary: {
    overallStatus: "operational" | "degraded" | "down"
    operationalCount: number
    degradedCount: number
    downCount: number
    totalServices: number
    generatedAt: string
  }
  services: ServiceItem[]
  resources: ResourceUsage
  recentIncidents: IncidentItem[]
  uptimeHistory: Array<{
    day: string
    status: "operational" | "degraded"
  }>
}

export default function SystemStatusPage() {
  const [data, setData] = useState<SystemStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pageError, setPageError] = useState("")
  const [currentTime, setCurrentTime] = useState(new Date())

  const loadSystemStatus = async (silent = false) => {
    try {
      if (silent) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }

      setPageError("")

      const res = await fetch("/api/admin/system-status", {
        credentials: "include",
        cache: "no-store",
      })

      const payload = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(payload?.error || "Failed to load system status")
      }

      setData(payload)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load system status")
    } finally {
      if (silent) {
        setIsRefreshing(false)
      } else {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    loadSystemStatus(false)

    const statusInterval = setInterval(() => {
      loadSystemStatus(true)
    }, 30000)

    const clockInterval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => {
      clearInterval(statusInterval)
      clearInterval(clockInterval)
    }
  }, [])

  const summary = data?.summary
  const services = data?.services ?? []
  const recentIncidents = data?.recentIncidents ?? []
  const resources = data?.resources
  const uptimeHistory = data?.uptimeHistory ?? []

  const overallStatusLabel = useMemo(() => {
    if (!summary) return "Loading..."
    if (summary.overallStatus === "down") return "Service Disruption"
    if (summary.overallStatus === "degraded") return "Partial Degradation"
    return "All Systems Operational"
  }, [summary])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Status</h1>
          <p className="text-sm text-muted-foreground">
            Real-time monitoring of system services and infrastructure
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isRefreshing && (
            <span className="text-xs text-muted-foreground">Refreshing…</span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => loadSystemStatus(false)}
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

      <Card
        className={
          summary?.overallStatus === "down"
            ? "border-destructive/30 bg-destructive/5"
            : summary?.overallStatus === "degraded"
              ? "border-amber-200 bg-amber-50"
              : "border-green-200 bg-green-50"
        }
      >
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full ${
                summary?.overallStatus === "down"
                  ? "bg-destructive/10"
                  : summary?.overallStatus === "degraded"
                    ? "bg-amber-100"
                    : "bg-green-100"
              }`}
            >
              {summary?.overallStatus === "down" ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              ) : summary?.overallStatus === "degraded" ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              )}
            </div>

            <div>
              <h2
                className={`text-2xl font-bold ${
                  summary?.overallStatus === "down"
                    ? "text-destructive"
                    : summary?.overallStatus === "degraded"
                      ? "text-amber-800"
                      : "text-green-800"
                }`}
              >
                {overallStatusLabel}
              </h2>
              <p
                className={`text-sm ${
                  summary?.overallStatus === "down"
                    ? "text-destructive/80"
                    : summary?.overallStatus === "degraded"
                      ? "text-amber-700"
                      : "text-green-700"
                }`}
              >
                {summary
                  ? `${summary.operationalCount} of ${summary.totalServices} services running normally`
                  : "Loading service summary..."}
              </p>
            </div>
          </div>

          <div className="text-center sm:text-right">
            <p className="text-sm text-muted-foreground">Last updated</p>
            <p className="text-sm font-medium">
              {summary?.generatedAt
                ? new Date(summary.generatedAt).toLocaleTimeString()
                : currentTime.toLocaleTimeString()}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Service Status</CardTitle>
          <CardDescription>Current status of all monitored services</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Loading services...</div>
          ) : services.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">No service data available</div>
          ) : (
            <div className="flex flex-col gap-3">
              {services.map((service) => (
                <div
                  key={service.name}
                  className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    service.status === "down"
                      ? "border-destructive/20 bg-destructive/5"
                      : service.status === "degraded"
                        ? "border-amber-200 bg-amber-50"
                        : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        service.status === "operational"
                          ? "bg-green-500"
                          : service.status === "degraded"
                            ? "bg-amber-500"
                            : "bg-destructive"
                      }`}
                    />
                    <span className="text-sm font-medium">{service.name}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Uptime:</span>
                      <span className="font-medium">{service.uptime.toFixed(2)}%</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Latency:</span>
                      <span
                        className={`font-medium ${
                          service.latency > 300
                            ? "text-destructive"
                            : service.latency > 150
                              ? "text-amber-600"
                              : "text-green-600"
                        }`}
                      >
                        {service.latency}ms
                      </span>
                    </div>

                    <Badge
                      variant="secondary"
                      className={
                        service.status === "operational"
                          ? "bg-green-100 text-green-700"
                          : service.status === "degraded"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-destructive/10 text-destructive"
                      }
                    >
                      {service.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resource Usage</CardTitle>
            <CardDescription>Current infrastructure utilization</CardDescription>
          </CardHeader>
          <CardContent>
            {!resources ? (
              <div className="py-8 text-sm text-muted-foreground">Loading resource usage...</div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">CPU Usage</span>
                    <span className="text-sm text-muted-foreground">{resources.cpu}%</span>
                  </div>
                  <Progress value={resources.cpu} className="h-2" />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Memory Usage</span>
                    <span className="text-sm text-muted-foreground">{resources.memory}%</span>
                  </div>
                  <Progress value={resources.memory} className="h-2" />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Storage Usage</span>
                    <span className="text-sm text-muted-foreground">{resources.storage}%</span>
                  </div>
                  <Progress value={resources.storage} className="h-2" />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Network Bandwidth</span>
                    <span className="text-sm text-muted-foreground">{resources.network}%</span>
                  </div>
                  <Progress value={resources.network} className="h-2" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Incidents</CardTitle>
            <CardDescription>Recent system events and issues</CardDescription>
          </CardHeader>
          <CardContent>
            {recentIncidents.length === 0 ? (
              <div className="py-8 text-sm text-muted-foreground">No recent incidents</div>
            ) : (
              <div className="flex flex-col gap-3">
                {recentIncidents.map((incident, index) => (
                  <div
                    key={`${incident.title}-${index}`}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{incident.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(incident.date).toLocaleDateString()} • Duration: {incident.duration}
                      </span>
                    </div>

                    <Badge
                      variant="secondary"
                      className={
                        incident.status === "resolved"
                          ? "bg-green-100 text-green-700"
                          : incident.status === "completed"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700"
                      }
                    >
                      {incident.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Uptime Summary (Last 90 Days)</CardTitle>
          <CardDescription>Historical service health overview</CardDescription>
        </CardHeader>
        <CardContent>
          {uptimeHistory.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">No uptime history available</div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-1">
                {uptimeHistory.map((entry, i) => (
                  <div
                    key={`${entry.day}-${i}`}
                    className={`h-8 w-1.5 rounded-full ${
                      entry.status === "degraded" ? "bg-amber-400" : "bg-green-500"
                    }`}
                    title={`${entry.day}: ${entry.status}`}
                  />
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>90 days ago</span>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded bg-green-500" />
                    <span>No issues</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded bg-amber-400" />
                    <span>Degraded</span>
                  </div>
                </div>
                <span>Today</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}