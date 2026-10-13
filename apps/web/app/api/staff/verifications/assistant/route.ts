import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";
import { askCaseAssistant } from "@/lib/gemini-case-assistant";

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

    const body = await req.json();
    const { verificationId, question } = body;

    if (!verificationId || !question) {
      return NextResponse.json(
        { error: "verificationId and question are required" },
        { status: 400 }
      );
    }

    const verification = await prisma.documentVerification.findUnique({
      where: { id: verificationId },
      include: {
        user: true,
        application: true,
      },
    });

    if (!verification) {
      return NextResponse.json(
        { error: "Verification not found" },
        { status: 404 }
      );
    }

    const formData =
      verification.application?.formData &&
      typeof verification.application.formData === "object" &&
      !Array.isArray(verification.application.formData)
        ? (verification.application.formData as Record<string, unknown>)
        : {};

    const residentFullName =
      (formData.fullName as string) ||
      `${verification.user.firstName || ""} ${verification.user.lastName || ""}`.trim();

    const prompt = `
You are an AI assistant helping DMV staff review one verification case.

Rules:
- Use only the case data below.
- Do not invent facts.
- Be concise and clear.
- Give guidance, not a final binding decision.
- If information is missing, say so.

CASE DATA
Case Number: ${verification.caseNumber || "N/A"}
Document Type: ${verification.documentType}
Current Status: ${verification.status}
AI Status: ${verification.aiStatus}
AI Confidence: ${verification.aiConfidence ?? 0}
AI Explanation: ${verification.aiExplanation || "N/A"}
Exception Reason: ${verification.exceptionReason || "N/A"}

Resident
Name: ${residentFullName}
Email: ${verification.user.email}
Address: ${(formData.address as string) || verification.user.address || ""}
City: ${(formData.city as string) || verification.user.city || ""}
ZIP: ${(formData.zipCode as string) || (formData.zip as string) || verification.user.zip || ""}

Extracted Fields
${JSON.stringify(verification.extractedFields ?? {}, null, 2)}

Mismatch Summary
${JSON.stringify(verification.mismatchSummary ?? [], null, 2)}

OCR Text
${verification.ocrText || "N/A"}

STAFF QUESTION
${question}
`;

    const answer = await askCaseAssistant(prompt);

    return NextResponse.json({
      success: true,
      answer,
    });
  } catch (error) {
    console.error("POST /api/staff/verifications/assistant error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get assistant response",
      },
      { status: 500 }
    );
  }
}