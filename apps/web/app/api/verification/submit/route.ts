import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";
import { runAgenticDocumentVerification } from "@/lib/agentic-document-verifier";

function buildCaseNumber(sequence: number) {
  const year = new Date().getFullYear();
  return `CASE-${year}-${String(sequence).padStart(6, "0")}`;
}

function getStringValue(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

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

    const body = await req.json();
    const {
      documentType,
      fileName,
      fileUrl,
      ocrText,
      extractedFields,
      aiConfidence,
    } = body;

    if (!documentType || !fileName) {
      return NextResponse.json(
        { error: "documentType and fileName are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        address: true,
        city: true,
        zip: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ✅ No status filter — find any application so form data is always available
    // for the side-by-side comparison and AI assistant on the staff review page
    const latestApplication = await prisma.application.findFirst({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
    });

    const applicationFormData =
      latestApplication?.formData &&
      typeof latestApplication.formData === "object" &&
      !Array.isArray(latestApplication.formData)
        ? (latestApplication.formData as Record<string, unknown>)
        : {};

    // Prefer form data, fall back to user record
    const residentFirstName =
      getStringValue(applicationFormData, ["firstName", "first_name"]) ||
      user.firstName;

    const residentLastName =
      getStringValue(applicationFormData, ["lastName", "last_name"]) ||
      user.lastName;

    const residentFullName =
      getStringValue(applicationFormData, ["fullName", "full_name", "name"]) ||
      `${residentFirstName} ${residentLastName}`.trim();

    const residentAddress =
      getStringValue(applicationFormData, [
        "address",
        "streetAddress",
        "street_address",
        "residentialAddress",
        "residential_address",
      ]) || user.address || "";

    const residentCity =
      getStringValue(applicationFormData, ["city", "residentialCity"]) ||
      user.city || "";

    const residentState =
      getStringValue(applicationFormData, ["state", "residentialState"]) || "";

    const residentZip =
      getStringValue(applicationFormData, [
        "zipCode",
        "zip",
        "zipcode",
        "postalCode",
        "postal_code",
      ]) || user.zip || "";

    const safeExtractedFields =
      extractedFields &&
      typeof extractedFields === "object" &&
      !Array.isArray(extractedFields)
        ? extractedFields
        : {};

    const extracted = safeExtractedFields as Record<string, unknown>;

    const agentResult = runAgenticDocumentVerification({
      resident: {
        fullName: residentFullName,
        firstName: residentFirstName,
        lastName: residentLastName,
        address: residentAddress,
        city: residentCity,
        state: residentState,
        zipCode: residentZip,
      },
      extracted: {
        documentType: String(extracted.documentType || ""),
        tenantName: String(extracted.tenantName || ""),
        landlordName: String(extracted.landlordName || ""),
        address: String(extracted.address || ""),
        city: String(extracted.city || ""),
        state: String(extracted.state || ""),
        zipCode: String(extracted.zipCode || ""),
        leaseStartDate: String(extracted.leaseStartDate || ""),
        leaseEndDate: String(extracted.leaseEndDate || ""),
      },
      ocrConfidence: typeof aiConfidence === "number" ? aiConfidence : null,
    });

    const verification = await prisma.$transaction(async (tx) => {
      await tx.documentVerification.updateMany({
        where: {
          userId: session.userId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      const totalCount = await tx.documentVerification.count();
      const caseNumber = buildCaseNumber(totalCount + 1);

      return tx.documentVerification.create({
        data: {
          userId: session.userId,
          applicationId: latestApplication?.id ?? null,
          documentType: String(documentType),
          fileName: String(fileName),
          fileUrl: fileUrl ? String(fileUrl) : null,
          caseNumber,
          status: agentResult.decision === "AUTO_APPROVE" ? "APPROVED" : "PENDING",
          aiStatus: agentResult.aiStatus,
          isStaffReview: agentResult.requiresStaffReview,
          isActive: true,
          isException: agentResult.isException,
          exceptionReason: agentResult.isException ? agentResult.explanation : null,
          aiConfidence: agentResult.confidence,
          aiExplanation: agentResult.explanation,
          mismatchSummary: agentResult.mismatchSummary,
          ocrText: ocrText ? String(ocrText) : null,
          extractedFields: safeExtractedFields,
          sentToStaffAt: agentResult.requiresStaffReview ? new Date() : null,
          reviewedAt: agentResult.decision === "AUTO_APPROVE" ? new Date() : null,
          reviewNotes:
            agentResult.decision === "AUTO_APPROVE"
              ? agentResult.explanation
              : null,
        },
      });
    });

    return NextResponse.json({
      success: true,
      verification: {
        ...verification,
        submittedAt: verification.submittedAt.toISOString(),
        sentToStaffAt: verification.sentToStaffAt?.toISOString() ?? null,
        reviewedAt: verification.reviewedAt?.toISOString() ?? null,
        flaggedAt: verification.flaggedAt?.toISOString() ?? null,
        createdAt: verification.createdAt.toISOString(),
        updatedAt: verification.updatedAt.toISOString(),
      },
      agent: agentResult,
    });
  } catch (error) {
    console.error("POST /api/verification/submit error:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Failed to create verification record" },
      { status: 500 }
    );
  }
}