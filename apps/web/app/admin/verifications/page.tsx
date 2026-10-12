"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface VerificationRequest {
  id: string
  caseNumber?: string
  userId: string
  userName: string
  userEmail: string
  documentType: string
  fileName: string
  status: "pending" | "approved" | "rejected"
  submittedAt: string
  aiConfidence: number
  aiStatus?: string
  aiExplanation?: string
  isStaffReview: boolean
  isException?: boolean
  exceptionReason?: string
  reviewedAt?: string | null
  reviewedBy?: string
  notes?: string
  ocrText?: string
  extractedFields?: {
    documentType?: string
    tenantName?: string
    landlordName?: string
    address?: string
    city?: string
    state?: string
    zipCode?: string
    leaseStartDate?: string
    leaseEndDate?: string
  }
  residentInfo?: {
    fullName?: string
    address?: string
    city?: string
    state?: string
    zipCode?: string
    phone?: string
  }
}

interface Counts {
  pending: number
  staffReview: number
  lowConfidence: number
  reviewed: number
  aiApproved: number
}

const statusFilters = ["all", "pending", "approved", "rejected"] as const
type StatusFilter = typeof statusFilters[number]

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

export default function AdminVerificationsPage() {
  const [verifications, setVerifications] = useState<VerificationRequest[]>([])
  const [counts, setCounts] = useState<Counts>({
    pending: 0, staffReview: 0, lowConfidence: 0, reviewed: 0, aiApproved: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const [selectedDoc, setSelectedDoc] = useState<VerificationRequest | null>(null)
  const [reviewNotes, setReviewNotes] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [actionError, setActionError] = useState("")

  const loadVerifications = useCallback(async (silent = false) => {
    try {
      if (silent) setIsRefreshing(true)
      else setIsLoading(true)

      // Build filter param based on status
      const params = new URLSearchParams()
      if (statusFilter === "approved" || statusFilter === "rejected") {
        params.set("filter", "reviewed")
      }
      if (searchQuery.trim()) params.set("q", searchQuery.trim())

      const url = params.toString()
        ? `/api/staff/verifications?${params.toString()}`
        : "/api/staff/verifications"

      const res = await fetch(url, { credentials: "include", cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to load verifications")

      // Filter client-side for approved/rejected since API returns both under "reviewed"
      const all: VerificationRequest[] = data.verifications || []
      setVerifications(all)
      setCounts(data.counts || { pending: 0, staffReview: 0, lowConfidence: 0, reviewed: 0, aiApproved: 0 })
    } catch (error) {
      console.error("Failed to load verifications:", error)
    } finally {
      if (silent) setIsRefreshing(false)
      else setIsLoading(false)
    }
  }, [statusFilter, searchQuery])

  useEffect(() => {
    loadVerifications(false)
    const interval = setInterval(() => loadVerifications(true), 10000)
    return () => clearInterval(interval)
  }, [loadVerifications])

  const handleDecision = async (decision: "APPROVED" | "REJECTED") => {
    if (!selectedDoc) return
    setIsProcessing(true)
    setActionError("")

    try {
      const res = await fetch("/api/staff/verifications/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          verificationId: selectedDoc.id,
          decision,
          notes: reviewNotes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Failed to ${decision.toLowerCase()} verification`)
      setSelectedDoc(null)
      setReviewNotes("")
      await loadVerifications(true)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed")
    } finally {
      setIsProcessing(false)
    }
  }

  const filteredVerifications = verifications.filter((v) => {
    const matchesStatus =
      statusFilter === "all" ? true :
      statusFilter === "pending" ? v.status === "pending" :
      statusFilter === "approved" ? v.status === "approved" :
      statusFilter === "rejected" ? v.status === "rejected" :
      true

    const q = searchQuery.toLowerCase()
    const matchesSearch =
      !searchQuery.trim() ||
      v.userName.toLowerCase().includes(q) ||
      v.userEmail.toLowerCase().includes(q) ||
      v.fileName.toLowerCase().includes(q) ||
      (v.caseNumber || "").toLowerCase().includes(q) ||
      v.documentType.toLowerCase().includes(q)

    return matchesStatus && matchesSearch
  })

  const handleExport = () => {
    const headers = ["Case Number", "Resident", "Email", "Document Type", "File", "Status", "AI Status", "AI Confidence", "Staff Review", "Submitted At", "Reviewed At"]
    const rows = filteredVerifications.map((v) => [
      v.caseNumber || "", v.userName, v.userEmail, v.documentType, v.fileName,
      v.status, v.aiStatus || "", `${Math.round(v.aiConfidence * 100)}%`,
      v.isStaffReview ? "Yes" : "No",
      new Date(v.submittedAt).toLocaleString(),
      v.reviewedAt ? new Date(v.reviewedAt).toLocaleString() : "",
    ])
    downloadCsv("verifications-admin.csv", [headers, ...rows])
  }

  const totalCount = counts.pending + counts.reviewed + counts.aiApproved
  const approvedCount = counts.reviewed // approximate — server gives combined reviewed
  const isReviewedCase = selectedDoc?.status === "approved" || selectedDoc?.status === "rejected"
  const isAiApproved = selectedDoc?.aiStatus === "APPROVED_BY_AI"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Verification Management</h1>
        <p className="text-sm text-muted-foreground">
          Review and manage all document verification requests
        </p>
        {isRefreshing && <p className="text-xs text-muted-foreground">Refreshing…</p>}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Pending Review", value: counts.pending, color: "text-amber-600", bg: "bg-amber-100" },
          { label: "Staff Review", value: counts.staffReview, color: "text-red-600", bg: "bg-red-100" },
          { label: "Low Confidence", value: counts.lowConfidence, color: "text-orange-600", bg: "bg-orange-100" },
          { label: "AI Approved", value: counts.aiApproved, color: "text-green-600", bg: "bg-green-100" },
          { label: "Reviewed", value: counts.reviewed, color: "text-foreground", bg: "bg-muted" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={stat.color}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {statusFilters.map((s) => (
                <Badge
                  key={s}
                  variant={statusFilter === s ? "default" : "outline"}
                  className="cursor-pointer capitalize"
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <Input
                  placeholder="Search by name, email, case..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredVerifications.length === 0}>
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Verification Requests</CardTitle>
          <CardDescription>
            {isLoading ? "Loading..." : `${filteredVerifications.length} verification${filteredVerifications.length !== 1 ? "s" : ""} found`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-4 text-sm text-muted-foreground">Loading verifications...</p>
            </div>
          ) : filteredVerifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/30"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <p className="mt-4 text-sm text-muted-foreground">No verification requests found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredVerifications.map((v) => (
                <div
                  key={v.id}
                  className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    v.aiStatus === "APPROVED_BY_AI" ? "border-green-200 bg-green-50" :
                    v.isStaffReview ? "border-red-200 bg-red-50" :
                    v.isException ? "border-orange-200 bg-orange-50" :
                    "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      v.aiStatus === "APPROVED_BY_AI" ? "bg-green-100" :
                      v.status === "approved" ? "bg-green-100" :
                      v.status === "rejected" ? "bg-red-100" :
                      v.isStaffReview ? "bg-red-100" :
                      "bg-amber-100"
                    }`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={
                        v.aiStatus === "APPROVED_BY_AI" ? "text-green-600" :
                        v.status === "approved" ? "text-green-600" :
                        v.status === "rejected" ? "text-red-600" :
                        v.isStaffReview ? "text-red-600" : "text-amber-600"
                      }><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-primary">{v.caseNumber || "No Case ID"}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{v.documentType}</p>
                        <Badge className={
                          v.status === "approved" ? "bg-green-100 text-green-700 text-[10px] hover:bg-green-100" :
                          v.status === "rejected" ? "bg-red-100 text-red-700 text-[10px] hover:bg-red-100" :
                          "bg-amber-100 text-amber-700 text-[10px] hover:bg-amber-100"
                        }>
                          {v.status}
                        </Badge>
                        {v.aiStatus === "APPROVED_BY_AI" && (
                          <Badge className="bg-green-100 text-green-700 text-[10px] hover:bg-green-100">AI Approved</Badge>
                        )}
                        {v.isStaffReview && v.status === "pending" && (
                          <Badge variant="destructive" className="text-[10px]">Staff Review</Badge>
                        )}
                        {v.isException && (
                          <Badge className="bg-orange-100 text-orange-700 text-[10px] hover:bg-orange-100">Exception</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{v.userName} • {v.userEmail}</p>
                      <p className="text-xs text-muted-foreground">{v.fileName} • {new Date(v.submittedAt).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">AI Confidence</p>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              v.aiConfidence >= 0.8 ? "bg-green-500" :
                              v.aiConfidence >= 0.6 ? "bg-amber-500" : "bg-red-500"
                            }`}
                            style={{ width: `${v.aiConfidence * 100}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold ${
                          v.aiConfidence >= 0.8 ? "text-green-600" :
                          v.aiConfidence >= 0.6 ? "text-amber-600" : "text-red-600"
                        }`}>
                          {Math.round(v.aiConfidence * 100)}%
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={v.status !== "pending" ? "outline" : "default"}
                      onClick={() => {
                        setSelectedDoc(v)
                        setReviewNotes(v.notes || "")
                        setActionError("")
                      }}
                    >
                      {v.status !== "pending" ? "View" : "Review"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedDoc} onOpenChange={(open) => {
        if (!open) { setSelectedDoc(null); setReviewNotes(""); setActionError("") }
      }}>
        <DialogContent className="sm:max-w-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {isAiApproved ? "AI Approved Case" : isReviewedCase ? "Reviewed Case" : "Review Document"}
            </DialogTitle>
            <DialogDescription>
              {isAiApproved
                ? "Auto-approved by AI. You can override by rejecting or flagging."
                : isReviewedCase
                  ? "This case has already been reviewed."
                  : "Review the document and make an approval decision."}
            </DialogDescription>
          </DialogHeader>

          {selectedDoc && (
            <div className="flex flex-col gap-4 py-2">
              {/* AI approved banner */}
              {isAiApproved && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/></svg>
                    <p className="text-sm font-semibold text-green-800">Auto-Approved by AI — {Math.round(selectedDoc.aiConfidence * 100)}% confidence</p>
                  </div>
                </div>
              )}

              {/* Case info */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-4 text-sm">
                <div><p className="text-xs text-muted-foreground">Case ID</p><p className="font-medium">{selectedDoc.caseNumber || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Resident</p><p className="font-medium">{selectedDoc.userName}</p></div>
                <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium break-all">{selectedDoc.userEmail}</p></div>
                <div><p className="text-xs text-muted-foreground">Document</p><p className="font-medium">{selectedDoc.fileName}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p>
                  <Badge className={
                    selectedDoc.status === "approved" ? "bg-green-100 text-green-700 hover:bg-green-100" :
                    selectedDoc.status === "rejected" ? "bg-red-100 text-red-700 hover:bg-red-100" :
                    "bg-amber-100 text-amber-700 hover:bg-amber-100"
                  }>{selectedDoc.status}</Badge>
                </div>
                <div><p className="text-xs text-muted-foreground">AI Confidence</p>
                  <Badge className={
                    selectedDoc.aiConfidence >= 0.8 ? "bg-green-100 text-green-700" :
                    selectedDoc.aiConfidence >= 0.6 ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"
                  }>{Math.round(selectedDoc.aiConfidence * 100)}%</Badge>
                </div>
                <div><p className="text-xs text-muted-foreground">Submitted</p><p className="font-medium">{new Date(selectedDoc.submittedAt).toLocaleString()}</p></div>
                {selectedDoc.reviewedAt && (
                  <div><p className="text-xs text-muted-foreground">Reviewed</p><p className="font-medium">{new Date(selectedDoc.reviewedAt).toLocaleString()}</p></div>
                )}
              </div>

              {/* AI explanation */}
              {selectedDoc.aiExplanation && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-semibold text-blue-800">AI Explanation</p>
                  <p className="mt-1 text-xs text-blue-700">{selectedDoc.aiExplanation}</p>
                </div>
              )}

              {/* Extracted fields */}
              {selectedDoc.extractedFields && (
                <div className="rounded-lg border border-border p-4">
                  <p className="mb-2 text-xs font-semibold text-foreground">Extracted Document Fields</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ["Tenant Name", selectedDoc.extractedFields.tenantName],
                      ["Address", selectedDoc.extractedFields.address],
                      ["City", selectedDoc.extractedFields.city],
                      ["State", selectedDoc.extractedFields.state],
                      ["ZIP", selectedDoc.extractedFields.zipCode],
                      ["Lease Start", selectedDoc.extractedFields.leaseStartDate],
                      ["Lease End", selectedDoc.extractedFields.leaseEndDate],
                    ].map(([label, value]) =>
                      value ? (
                        <div key={label}>
                          <p className="text-muted-foreground">{label}</p>
                          <p className="font-medium">{value}</p>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              )}

              {/* Resident info */}
              {selectedDoc.residentInfo && (
                <div className="rounded-lg border border-border p-4">
                  <p className="mb-2 text-xs font-semibold text-foreground">Resident Submitted Info</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-muted-foreground">Full Name</p><p className="font-medium">{selectedDoc.residentInfo.fullName || "—"}</p></div>
                    <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{selectedDoc.residentInfo.phone || "—"}</p></div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Address</p>
                      <p className="font-medium">
                        {selectedDoc.residentInfo.address || "—"}
                        {selectedDoc.residentInfo.city ? `, ${selectedDoc.residentInfo.city}` : ""}
                        {selectedDoc.residentInfo.state ? `, ${selectedDoc.residentInfo.state}` : ""}
                        {selectedDoc.residentInfo.zipCode ? ` ${selectedDoc.residentInfo.zipCode}` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Existing notes */}
              {selectedDoc.notes && (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold text-foreground">Review Notes</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedDoc.notes}</p>
                </div>
              )}

              {/* Notes input for pending */}
              {!isReviewedCase && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-foreground">Add Notes</p>
                  <Textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Optional notes about this decision..."
                    className="min-h-[80px]"
                  />
                </div>
              )}

              {actionError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionError}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setSelectedDoc(null); setReviewNotes(""); setActionError("") }} disabled={isProcessing}>
              Close
            </Button>
            {selectedDoc && !isReviewedCase && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => handleDecision("REJECTED")}
                  disabled={isProcessing}
                  className="gap-2"
                >
                  {isProcessing ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : null}
                  Reject
                </Button>
                {!isAiApproved && (
                  <Button
                    onClick={() => handleDecision("APPROVED")}
                    disabled={isProcessing}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                  >
                    {isProcessing ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : null}
                    Approve
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}