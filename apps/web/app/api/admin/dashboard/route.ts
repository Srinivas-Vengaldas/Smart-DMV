import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/auth"

async function requireAdminOrStaff() {
  const cookieStore = await cookies()
  const token = cookieStore.get("session")?.value

  if (!token) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  let session: { userId: string; email: string; role?: string }
  try {
    session = verifySession(token)
  } catch {
    return {
      error: NextResponse.json({ error: "Invalid session" }, { status: 401 }),
    }
  }

  if (session.role !== "ADMIN" && session.role !== "STAFF") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return { session }
}

function getRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) return "Just now"
  if (diffMinutes < 60) return `${diffMinutes} min ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
}

export async function GET() {
  try {
    const auth = await requireAdminOrStaff()
    if (auth.error) return auth.error

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const [
      totalVerifications,
      todayVerifications,
      pendingReviews,
      approvedCount,
      rejectedCount,
      totalUsers,
      staffUsers,
      recentVerificationsRaw,
      failedLogins,
      systemFailures,
    ] = await Promise.all([
      prisma.documentVerification.count(),

      prisma.documentVerification.count({
        where: {
          createdAt: {
            gte: startOfToday,
          },
        },
      }),

      prisma.documentVerification.count({
        where: {
          status: "PENDING",
          isActive: true,
        },
      }),

      prisma.documentVerification.count({
        where: {
          status: "APPROVED",
        },
      }),

      prisma.documentVerification.count({
        where: {
          status: "REJECTED",
        },
      }),

      prisma.user.count(),

      prisma.user.count({
        where: {
          role: "STAFF",
        },
      }),

      prisma.documentVerification.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
        select: {
          id: true,
          caseNumber: true,
          documentType: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),

      prisma.auditLog.count({
        where: {
          category: "LOGIN",
          status: "FAILED",
        },
      }),

      prisma.auditLog.count({
        where: {
          category: "SYSTEM",
          status: "FAILED",
        },
      }),
    ])

    const reviewedTotal = approvedCount + rejectedCount
    const approvalRate =
      reviewedTotal > 0 ? Number(((approvedCount / reviewedTotal) * 100).toFixed(1)) : 0

    const averageProcessingTimeRaw = await prisma.documentVerification.findMany({
      where: {
        reviewedAt: {
          not: null,
        },
      },
      select: {
        createdAt: true,
        reviewedAt: true,
      },
      take: 100,
      orderBy: {
        reviewedAt: "desc",
      },
    })

    const averageProcessingTime =
      averageProcessingTimeRaw.length > 0
        ? Number(
            (
              averageProcessingTimeRaw.reduce((sum, item) => {
                const reviewedAt = item.reviewedAt ? new Date(item.reviewedAt).getTime() : 0
                const createdAt = new Date(item.createdAt).getTime()
                return sum + (reviewedAt - createdAt) / (1000 * 60 * 60)
              }, 0) / averageProcessingTimeRaw.length
            ).toFixed(1)
          )
        : 0

    const recentVerifications = recentVerificationsRaw.map((item) => ({
      id: item.id,
      caseNumber: item.caseNumber || "No Case ID",
      user: `${item.user.firstName} ${item.user.lastName}`.trim(),
      type: item.documentType,
      status:
        item.status === "APPROVED"
          ? "approved"
          : item.status === "REJECTED"
            ? "rejected"
            : "pending",
      time: getRelativeTime(item.createdAt),
    }))

    const systemAlerts = []

    if (pendingReviews > 10) {
      systemAlerts.push({
        type: "warning" as const,
        message: `${pendingReviews} cases are currently waiting for manual review.`,
      })
    }

    if (failedLogins > 0) {
      systemAlerts.push({
        type: "warning" as const,
        message: `${failedLogins} failed login attempt${failedLogins === 1 ? "" : "s"} recorded.`,
      })
    }

    if (systemFailures > 0) {
      systemAlerts.push({
        type: "warning" as const,
        message: `${systemFailures} system failure log${systemFailures === 1 ? "" : "s"} detected in audit trail.`,
      })
    }

    if (systemAlerts.length === 0) {
      systemAlerts.push({
        type: "success" as const,
        message: "All monitored services and admin workflows are operating normally.",
      })
    }

    return NextResponse.json({
      success: true,
      metrics: {
        totalVerifications,
        todayVerifications,
        approvalRate,
        averageProcessingTime,
        pendingReviews,
        activeUsers: totalUsers,
        staffUsers,
        systemHealth: 99.9,
      },
      recentVerifications,
      systemAlerts,
    })
  } catch (error) {
    console.error("GET /api/admin/dashboard error:", error)
    return NextResponse.json(
      { error: "Failed to load dashboard" },
      { status: 500 }
    )
  }
}