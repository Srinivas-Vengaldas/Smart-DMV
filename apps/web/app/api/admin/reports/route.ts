import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let session: { userId: string; email: string; role?: string };
    try {
      session = verifySession(token);
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    if (session.role !== "ADMIN" && session.role !== "STAFF") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "week";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let since: Date;
    switch (range) {
      case "today":
        since = today;
        break;
      case "month":
        since = new Date(today);
        since.setMonth(since.getMonth() - 1);
        break;
      case "all":
        since = new Date(0);
        break;
      default: // week
        since = new Date(today);
        since.setDate(since.getDate() - 7);
    }

    // Fetch appointments and verifications in parallel
    const [appointments, verifications] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          bookedAt: { gte: since },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { bookedAt: "desc" },
      }),

      prisma.documentVerification.findMany({
        where: {
          submittedAt: { gte: since },
        },
        select: {
          id: true,
          caseNumber: true,
          status: true,
          aiStatus: true,
          aiConfidence: true,
          submittedAt: true,
          reviewedAt: true,
          documentType: true,
          isStaffReview: true,
          isException: true,
          reviewedById: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          reviewedBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { submittedAt: "desc" },
      }),
    ]);

    // ── Appointment stats ──────────────────────────────────────────
    const apptTotal = appointments.length;
    const apptCompleted = appointments.filter((a) => a.status === "COMPLETED").length;
    const apptScheduled = appointments.filter((a) => a.status === "SCHEDULED").length;
    const apptCancelled = appointments.filter((a) => a.status === "CANCELLED").length;
    const apptNoShow = appointments.filter((a) => a.status === "NO_SHOW").length;
    const completionRate = apptTotal > 0 ? Math.round((apptCompleted / apptTotal) * 100) : 0;

    // Staff performance
    const staffMap: Record<string, { id: string; name: string; completed: number; noShow: number }> = {};
    appointments.forEach((a) => {
      if (a.staffId && a.staffName) {
        if (!staffMap[a.staffId]) {
          staffMap[a.staffId] = { id: a.staffId, name: a.staffName, completed: 0, noShow: 0 };
        }
        if (a.status === "COMPLETED") staffMap[a.staffId].completed++;
        if (a.status === "NO_SHOW") staffMap[a.staffId].noShow++;
      }
    });

    // Location breakdown
    const locationMap: Record<string, number> = {};
    appointments.forEach((a) => {
      locationMap[a.locationName] = (locationMap[a.locationName] || 0) + 1;
    });

    // ── Verification stats ─────────────────────────────────────────
    const verifTotal = verifications.length;
    const verifApproved = verifications.filter((v) => v.status === "APPROVED").length;
    const verifRejected = verifications.filter((v) => v.status === "REJECTED").length;
    const verifPending = verifications.filter((v) => v.status === "PENDING").length;
    const verifAiApproved = verifications.filter((v) => v.aiStatus === "APPROVED_BY_AI").length;
    const verifStaffReview = verifications.filter((v) => v.isStaffReview).length;
    const verifExceptions = verifications.filter((v) => v.isException).length;
    const approvalRate = verifTotal > 0 ? Math.round((verifApproved / verifTotal) * 100) : 0;

    // Reviewer performance
    const reviewerMap: Record<string, { id: string; name: string; approved: number; rejected: number }> = {};
    verifications.forEach((v) => {
      if (v.reviewedById && v.reviewedBy) {
        const name = `${v.reviewedBy.firstName} ${v.reviewedBy.lastName}`.trim();
        if (!reviewerMap[v.reviewedById]) {
          reviewerMap[v.reviewedById] = { id: v.reviewedById, name, approved: 0, rejected: 0 };
        }
        if (v.status === "APPROVED") reviewerMap[v.reviewedById].approved++;
        if (v.status === "REJECTED") reviewerMap[v.reviewedById].rejected++;
      }
    });

    return NextResponse.json({
      success: true,
      appointments: {
        total: apptTotal,
        completed: apptCompleted,
        scheduled: apptScheduled,
        cancelled: apptCancelled,
        noShow: apptNoShow,
        completionRate,
        staffStats: Object.values(staffMap).sort((a, b) => b.completed - a.completed),
        locationStats: Object.entries(locationMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        recent: appointments.slice(0, 50).map((a) => ({
          id: a.id,
          userName: `${a.user.firstName} ${a.user.lastName}`.trim(),
          userEmail: a.user.email,
          date: a.appointmentDate.toISOString(),
          time: a.timeLabel,
          locationName: a.locationName,
          status: a.status.toLowerCase(),
          staffName: a.staffName ?? null,
          bookedAt: a.bookedAt.toISOString(),
        })),
      },
      verifications: {
        total: verifTotal,
        approved: verifApproved,
        rejected: verifRejected,
        pending: verifPending,
        aiApproved: verifAiApproved,
        staffReview: verifStaffReview,
        exceptions: verifExceptions,
        approvalRate,
        reviewerStats: Object.values(reviewerMap).sort(
          (a, b) => b.approved + b.rejected - (a.approved + a.rejected)
        ),
        recent: verifications.slice(0, 50).map((v) => ({
          id: v.id,
          caseNumber: v.caseNumber ?? "",
          userName: `${v.user.firstName} ${v.user.lastName}`.trim(),
          userEmail: v.user.email,
          documentType: v.documentType,
          status: v.status.toLowerCase(),
          aiStatus: v.aiStatus,
          aiConfidence: v.aiConfidence ?? 0,
          submittedAt: v.submittedAt.toISOString(),
          reviewedAt: v.reviewedAt?.toISOString() ?? null,
          isException: v.isException,
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/admin/reports error:", error);
    return NextResponse.json(
      { error: "Failed to load reports data" },
      { status: 500 }
    );
  }
}