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

export async function GET() {
  try {
    const auth = await requireAdminOrStaff()
    if (auth.error) return auth.error

    const [logs, totalEvents, successfulEvents, failedEvents, securityAlerts] =
      await Promise.all([
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            action: true,
            actorEmail: true,
            target: true,
            ipAddress: true,
            status: true,
            category: true,
            createdAt: true,
          },
        }),

        prisma.auditLog.count(),

        prisma.auditLog.count({
          where: { status: "SUCCESS" },
        }),

        prisma.auditLog.count({
          where: { status: "FAILED" },
        }),

        prisma.auditLog.count({
          where: {
            status: "FAILED",
            OR: [{ category: "LOGIN" }, { category: "SYSTEM" }],
          },
        }),
      ])

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      action: log.action,
      actor: log.actorEmail || "Unknown",
      target: log.target || "N/A",
      timestamp: log.createdAt.toISOString(),
      ip: log.ipAddress || "Unknown",
      status: log.status.toLowerCase(),
      category: log.category.toLowerCase(),
    }))

    return NextResponse.json({
      success: true,
      logs: formattedLogs,
      summary: {
        totalEvents,
        successfulEvents,
        failedEvents,
        securityAlerts,
      },
    })
  } catch (error) {
    console.error("GET /api/admin/audit error:", error)
    return NextResponse.json(
      { error: "Failed to load audit logs" },
      { status: 500 }
    )
  }
}