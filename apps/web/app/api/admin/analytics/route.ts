import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/auth"

async function requireAdminOrStaff() {
  const cookieStore = await cookies()
  const token = cookieStore.get("session")?.value

  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  let session: { userId: string; email: string; role?: string }
  try {
    session = verifySession(token)
  } catch {
    return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) }
  }

  if (session.role !== "ADMIN" && session.role !== "STAFF") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { session }
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdminOrStaff()
    if (auth.error) return auth.error

    const { searchParams } = new URL(req.url)
    const range = searchParams.get("range") || "7d"

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    let since: Date
    let days: number
    switch (range) {
      case "30d":
        days = 30
        since = new Date(today)
        since.setDate(since.getDate() - 29)
        break
      case "90d":
        days = 90
        since = new Date(today)
        since.setDate(since.getDate() - 89)
        break
      default: // 7d
        days = 7
        since = new Date(today)
        since.setDate(since.getDate() - 6)
    }

    // Fetch all verifications in range with minimal fields
    const verifications = await prisma.documentVerification.findMany({
      where: { submittedAt: { gte: since } },
      select: {
        id: true,
        status: true,
        aiStatus: true,
        documentType: true,
        submittedAt: true,
        reviewedAt: true,
        createdAt: true,
      },
    })

    // ── Daily trend ────────────────────────────────────────────────
    const dailyMap: Record<string, { label: string; approved: number; rejected: number; pending: number }> = {}

    for (let i = 0; i < days; i++) {
      const d = new Date(since)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().split("T")[0]
      const label = days <= 7
        ? d.toLocaleDateString("en-US", { weekday: "short" })
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      dailyMap[key] = { label, approved: 0, rejected: 0, pending: 0 }
    }

    verifications.forEach((v) => {
      const key = new Date(v.submittedAt).toISOString().split("T")[0]
      if (!dailyMap[key]) return
      if (v.status === "APPROVED") dailyMap[key].approved++
      else if (v.status === "REJECTED") dailyMap[key].rejected++
      else dailyMap[key].pending++
    })

    const dailyTrend = Object.values(dailyMap)

    // ── Document type distribution ─────────────────────────────────
    const typeMap: Record<string, number> = {}
    verifications.forEach((v) => {
      const t = v.documentType || "Unknown"
      typeMap[t] = (typeMap[t] || 0) + 1
    })
    const total = verifications.length
    const documentTypes = Object.entries(typeMap)
      .map(([type, count]) => ({
        type,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)

    // ── Hourly traffic (all time to be meaningful) ─────────────────
    const hourlyMap: Record<number, number> = {}
    for (let h = 0; h < 24; h++) hourlyMap[h] = 0

    verifications.forEach((v) => {
      const hour = new Date(v.submittedAt).getHours()
      hourlyMap[hour]++
    })

    const hourlyTraffic = Object.entries(hourlyMap)
      .filter(([h]) => {
        const n = Number(h)
        return n >= 6 && n <= 20 // show 6 AM - 8 PM
      })
      .map(([h, count]) => ({
        hour: new Date(0, 0, 0, Number(h)).toLocaleTimeString("en-US", { hour: "numeric", hour12: true }),
        count,
      }))

    // ── AI status breakdown ────────────────────────────────────────
    const aiApproved = verifications.filter((v) => v.aiStatus === "APPROVED_BY_AI").length
    const staffApproved = verifications.filter((v) => v.aiStatus === "APPROVED_BY_STAFF").length
    const staffRejected = verifications.filter((v) => v.aiStatus === "REJECTED_BY_STAFF").length
    const timedOut = verifications.filter((v) => v.aiStatus === "TIMED_OUT").length
    const approvedTotal = verifications.filter((v) => v.status === "APPROVED").length
    const rejectedTotal = verifications.filter((v) => v.status === "REJECTED").length
    const approvalRate = (approvedTotal + rejectedTotal) > 0
      ? Math.round((approvedTotal / (approvedTotal + rejectedTotal)) * 100)
      : 0

    // ── Key insights (computed from real data) ────────────────────
    const insights: { type: "success" | "warning" | "info"; title: string; description: string }[] = []

    if (approvalRate >= 90) {
      insights.push({ type: "success", title: "High Approval Rate", description: `${approvalRate}% approval rate in this period.` })
    } else if (approvalRate < 70) {
      insights.push({ type: "warning", title: "Low Approval Rate", description: `Only ${approvalRate}% approval rate — review rejection reasons.` })
    }

    const aiAutoRate = total > 0 ? Math.round((aiApproved / total) * 100) : 0
    if (aiAutoRate >= 50) {
      insights.push({ type: "success", title: "AI Efficiency High", description: `${aiAutoRate}% of verifications were auto-approved by AI.` })
    }

    if (timedOut > 0) {
      insights.push({ type: "warning", title: "AI Timeouts Detected", description: `${timedOut} verification${timedOut !== 1 ? "s" : ""} timed out and were escalated to staff.` })
    }

    const peakHour = hourlyTraffic.reduce((max, h) => h.count > max.count ? h : max, { hour: "—", count: 0 })
    if (peakHour.count > 0) {
      insights.push({ type: "info", title: "Peak Hour", description: `Highest traffic at ${peakHour.hour} with ${peakHour.count} submissions.` })
    }

    if (documentTypes[0]) {
      insights.push({ type: "info", title: `${documentTypes[0].type} Most Common`, description: `${documentTypes[0].percentage}% of all verifications in this period.` })
    }

    return NextResponse.json({
      success: true,
      summary: {
        total,
        approved: approvedTotal,
        rejected: rejectedTotal,
        approvalRate,
        aiApproved,
        staffApproved,
        staffRejected,
        timedOut,
      },
      dailyTrend,
      documentTypes,
      hourlyTraffic,
      insights,
    })
  } catch (error) {
    console.error("GET /api/admin/analytics error:", error)
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 })
  }
}