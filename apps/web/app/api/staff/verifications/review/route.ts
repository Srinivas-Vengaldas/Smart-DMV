import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { getRequestIp } from "@/lib/request-ip";

export async function POST(req: Request) {
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

    if (session.role !== "STAFF" && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { verificationId, decision, notes } = await req.json();

    if (!verificationId || !decision) {
      return NextResponse.json(
        { error: "verificationId and decision required" },
        { status: 400 }
      );
    }

    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return NextResponse.json(
        { error: "decision must be APPROVED or REJECTED" },
        { status: 400 }
      );
    }

    const ipAddress = await getRequestIp();

    const result = await prisma.$transaction(async (tx) => {
      const existingVerification = await tx.documentVerification.findUnique({
        where: { id: verificationId },
        select: {
          id: true,
          caseNumber: true,
          status: true,
          userId: true,
          applicationId: true,
        },
      });

      if (!existingVerification) {
        throw new Error("Verification not found");
      }

      const verification = await tx.documentVerification.update({
        where: { id: verificationId },
        data: {
          status: decision,
          reviewedById: session.userId,
          reviewedAt: new Date(),
          reviewNotes: notes ?? "",
          aiStatus:
            decision === "APPROVED"
              ? "APPROVED_BY_STAFF"
              : "REJECTED_BY_STAFF",
        },
      });

      if (existingVerification.applicationId) {
        await tx.application.update({
          where: { id: existingVerification.applicationId },
          data: {
            status: decision === "APPROVED" ? "APPROVED" : "REJECTED",
          },
        });
      }

      const activity = await tx.staffActivity.create({
        data: {
          staffId: session.userId,
          verificationId: verification.id,
          action: decision === "APPROVED" ? "APPROVED" : "REJECTED",
          notes: notes ?? "",
        },
      });

      console.log(
        "STAFF ACTIVITY CREATED:",
        activity.id,
        activity.action,
        activity.createdAt
      );

      return verification;
    });

    await createAuditLog({
      action: decision === "APPROVED" ? "Document approved" : "Document rejected",
      actorId: session.userId,
      actorEmail: session.email,
      target: result.caseNumber || result.id,
      ipAddress,
      status: "SUCCESS",
      category: "DOCUMENT",
      metadata: {
        verificationId: result.id,
        decision,
        notes: notes ?? "",
        reviewedById: session.userId,
      },
    });

    return NextResponse.json({
      success: true,
      verification: result,
    });
  } catch (error) {
    console.error("POST /api/staff/verifications/review error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to review verification",
      },
      { status: 500 }
    );
  }
}