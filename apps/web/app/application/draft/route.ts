// app/application/draft/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";

const META_KEY = "__META__";
const EDITABLE_STATUSES = ["DRAFT", "REJECTED"] as const;

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

async function getOrCreateEditableApplication(userId: string) {
  let app = await prisma.application.findFirst({
    where: {
      userId,
      status: {
        in: [...EDITABLE_STATUSES],
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!app) {
    app = await prisma.application.create({
      data: { userId, status: "DRAFT" },
    });
  }

  return app;
}

// GET /application/draft
export async function GET() {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) return NextResponse.json({ draft: null }, { status: 200 });

    const app = await prisma.application.findFirst({
      where: {
        userId,
        status: {
          in: [...EDITABLE_STATUSES],
        },
      },
      orderBy: { updatedAt: "desc" },
      include: { steps: true },
    });

    if (!app) return NextResponse.json({ draft: null }, { status: 200 });

    const meta = app.steps.find((s) => s.stepKey === META_KEY)?.payload as any;
    const currentStep = typeof meta?.currentStep === "number" ? meta.currentStep : 0;

    const data: Record<string, any> = {};

    for (const s of app.steps) {
      if (s.stepKey === META_KEY) continue;

      const payload = s.payload as any;

      if (payload?.data && typeof payload.data === "object") {
        Object.assign(data, payload.data);
      }
    }

    return NextResponse.json(
      {
        draft: {
          applicationId: app.id,
          status: app.status,
          currentStep,
          data,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /application/draft error:", error);
    return NextResponse.json({ draft: null }, { status: 200 });
  }
}

// POST /application/draft
export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromSession();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const currentStep = Number(body?.currentStep ?? 0);
    const data = body?.data ?? {};

    if (!Number.isFinite(currentStep) || currentStep < 0) {
      return NextResponse.json({ error: "Invalid currentStep" }, { status: 400 });
    }

    const app = await getOrCreateEditableApplication(userId);
    const stepKey = `STEP_${currentStep}`;

    await prisma.applicationStep.upsert({
      where: {
        applicationId_stepKey: {
          applicationId: app.id,
          stepKey,
        },
      },
      create: {
        applicationId: app.id,
        stepKey,
        payload: { data },
      },
      update: {
        payload: { data },
      },
    });

    await prisma.applicationStep.upsert({
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
          currentStep,
          wasRejected: app.status === "REJECTED",
          lastEditedAt: new Date().toISOString(),
        },
      },
      update: {
        payload: {
          currentStep,
          wasRejected: app.status === "REJECTED",
          lastEditedAt: new Date().toISOString(),
        },
      },
    });

    await prisma.application.update({
      where: { id: app.id },
      data: {
        status: "DRAFT",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        applicationId: app.id,
        wasRejected: app.status === "REJECTED",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /application/draft error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}