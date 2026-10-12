// app/application/submit/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";

const META_KEY = "__META__";
const SUBMITTABLE_STATUSES = ["DRAFT", "REJECTED"] as const;

async function getUserIdFromSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) return null;

  try {
    const payload = verifySession(token);
    return payload.userId;
  } catch {
    return null;
  }
}

function mergeStepData(steps: Array<{ stepKey: string; payload: unknown }>) {
  const merged: Record<string, unknown> = {};

  for (const step of steps) {
    if (step.stepKey === META_KEY) continue;

    const payload = step.payload as { data?: Record<string, unknown> } | null;

    if (payload?.data && typeof payload.data === "object") {
      Object.assign(merged, payload.data);
    }
  }

  return merged;
}

function normalizeCanonical(data: Record<string, unknown>) {
  const out = { ...data };

  if (typeof out.email === "string") {
    out.email = out.email.trim().toLowerCase();
  }

  if (typeof out.firstName === "string") {
    out.firstName = out.firstName.trim();
  }

  if (typeof out.lastName === "string") {
    out.lastName = out.lastName.trim();
  }

  if (typeof out.phone === "string") {
    out.phone = out.phone.trim();
  }

  if (typeof out.address === "string") {
    out.address = out.address.trim();
  }

  if (typeof out.city === "string") {
    out.city = out.city.trim();
  }

  if (typeof out.state === "string") {
    out.state = out.state.trim().toUpperCase();
  }

  if (typeof out.zipCode === "string") {
    out.zipCode = out.zipCode.trim();
  }

  return out;
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromSession();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedApplicationId =
      typeof (body as any)?.applicationId === "string" &&
      (body as any).applicationId.trim()
        ? (body as any).applicationId.trim()
        : null;

    const result = await prisma.$transaction(async (tx) => {
      const app = requestedApplicationId
        ? await tx.application.findFirst({
            where: {
              id: requestedApplicationId,
              userId,
              status: {
                in: [...SUBMITTABLE_STATUSES],
              },
            },
            include: { steps: true },
          })
        : await tx.application.findFirst({
            where: {
              userId,
              status: {
                in: [...SUBMITTABLE_STATUSES],
              },
            },
            orderBy: { updatedAt: "desc" },
            include: { steps: true },
          });

      if (!app) {
        return {
          status: 404,
          payload: {
            error: "No draft or rejected application found",
          },
        };
      }

      const previousStatus = app.status;
      const isResubmission = previousStatus === "REJECTED";

      const nonMetaSteps = app.steps.filter((step) => step.stepKey !== META_KEY);

      if (nonMetaSteps.length === 0) {
        return {
          status: 400,
          payload: {
            error: "Application has no saved data",
          },
        };
      }

      const mergedDataRaw = mergeStepData(app.steps);
      const mergedData = normalizeCanonical(mergedDataRaw);

      const required = ["email", "firstName", "lastName", "phone"] as const;
      const missing = required.filter((key) => !mergedData?.[key]);

      if (missing.length > 0) {
        return {
          status: 400,
          payload: {
            error: "Missing required fields",
            missing,
          },
        };
      }

      await tx.application.update({
        where: { id: app.id },
        data: {
          status: "SUBMITTED",
          formData: mergedData,
        },
      });

      await tx.applicationStep.upsert({
        where: {
          applicationId_stepKey: {
            applicationId: app.id,
            stepKey: META_KEY,
          },
        },
        create: {
          applicationId: app.id,
          stepKey: META_KEY,
          payload: {
            currentStep: 0,
            submittedAt: new Date().toISOString(),
            submittedBy: userId,
            resubmitted: isResubmission,
            previousStatus,
          },
        },
        update: {
          payload: {
            currentStep: 0,
            submittedAt: new Date().toISOString(),
            submittedBy: userId,
            resubmitted: isResubmission,
            previousStatus,
          },
        },
      });

      return {
        status: 200,
        payload: {
          ok: true,
          applicationId: app.id,
          resubmitted: isResubmission,
        },
      };
    });

    return NextResponse.json(result.payload, { status: result.status });
  } catch (error) {
    console.error("POST /application/submit error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}