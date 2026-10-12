import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";

async function escalateResidentTimedOutVerification(userId: string) {
  const latestPending = await prisma.documentVerification.findFirst({
    where: {
      userId,
      isActive: true,
      status: "PENDING",
      aiStatus: "PENDING",
      isStaffReview: false,
    },
    orderBy: {
      submittedAt: "desc",
    },
  });

  if (!latestPending) return;

  const isTimedOut =
    Date.now() - new Date(latestPending.submittedAt).getTime() >= 60 * 1000;

  if (!isTimedOut) return;

  await prisma.documentVerification.update({
    where: { id: latestPending.id },
    data: {
      isStaffReview: true,
      aiStatus: "TIMED_OUT",
      sentToStaffAt: new Date(),
    },
  });
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

function normalizeApplicationFormData(formData: unknown) {
  if (!formData || typeof formData !== "object" || Array.isArray(formData)) {
    return {};
  }

  return formData as Record<string, unknown>;
}

export async function GET() {
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

    await escalateResidentTimedOutVerification(session.userId);

    const verification = await prisma.documentVerification.findFirst({
      where: {
        userId: session.userId,
        isActive: true,
      },
      orderBy: {
        submittedAt: "desc",
      },
    });

    if (!verification) {
      return NextResponse.json({
        success: true,
        verification: null,
      });
    }

    const application = verification.applicationId
      ? await prisma.application.findFirst({
          where: {
            id: verification.applicationId,
            userId: session.userId,
          },
          select: {
            id: true,
            status: true,
            formData: true,
          },
        })
      : await prisma.application.findFirst({
          where: {
            userId: session.userId,
          },
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            id: true,
            status: true,
            formData: true,
          },
        });

    const formData = normalizeApplicationFormData(application?.formData);

    const firstName = getStringValue(formData, ["firstName", "first_name"]);
    const lastName = getStringValue(formData, ["lastName", "last_name"]);
    const fullName =
      getStringValue(formData, ["fullName", "full_name", "name"]) ||
      `${firstName} ${lastName}`.trim();

    const residentInfo = {
      fullName,
      firstName,
      lastName,
      phone: getStringValue(formData, ["phone", "cellPhone", "cell_phone"]),
      address: getStringValue(formData, [
        "address",
        "streetAddress",
        "street_address",
        "residentialAddress",
        "residential_address",
      ]),
      apartmentName: getStringValue(formData, [
        "apartmentName",
        "apartment_name",
        "buildingName",
        "building_name",
      ]),
      aptUnit: getStringValue(formData, [
        "aptUnit",
        "apt_unit",
        "unit",
        "unitNumber",
        "unit_number",
      ]),
      city: getStringValue(formData, ["city", "residentialCity"]),
      state: getStringValue(formData, ["state", "residentialState"]),
      zipCode: getStringValue(formData, [
        "zipCode",
        "zip",
        "zipcode",
        "postalCode",
        "postal_code",
      ]),
      ssnLast4: getStringValue(formData, ["ssnLast4", "ssn_last4"]),
      applicationId: application?.id ?? null,
      applicationStatus: application?.status ?? null,
    };

    return NextResponse.json({
      success: true,
      verification: {
        id: verification.id,
        documentType: verification.documentType,
        fileName: verification.fileName,
        status: verification.status,
        aiStatus: verification.aiStatus,
        isStaffReview: verification.isStaffReview,
        aiConfidence: verification.aiConfidence,
        ocrText: verification.ocrText,
        extractedFields: verification.extractedFields,
        residentInfo,
        submittedAt: verification.submittedAt.toISOString(),
        sentToStaffAt: verification.sentToStaffAt?.toISOString() ?? null,
        reviewedAt: verification.reviewedAt?.toISOString() ?? null,
        reviewNotes: verification.reviewNotes ?? "",
      },
    });
  } catch (error) {
    console.error("GET /api/verification/me error:", error);

    return NextResponse.json(
      { error: "Failed to load verification status" },
      { status: 500 }
    );
  }
}