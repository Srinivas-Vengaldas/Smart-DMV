import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";

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

    const { appointmentId } = await req.json();

    if (!appointmentId) {
      return NextResponse.json(
        { error: "appointmentId is required" },
        { status: 400 }
      );
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        userId: session.userId,
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { error: "Appointment not found" },
        { status: 404 }
      );
    }

    if (appointment.status !== "SCHEDULED") {
      return NextResponse.json(
        { error: "Only scheduled appointments can be cancelled" },
        { status: 409 }
      );
    }

    // ✅ Block cancellation within 24 hours of the appointment
    const hoursUntilAppointment =
      (new Date(appointment.appointmentDate).getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilAppointment < 24) {
      return NextResponse.json(
        {
          error:
            "Appointments cannot be cancelled within 24 hours of the scheduled time. Please contact the DMV directly.",
        },
        { status: 403 }
      );
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      appointment: {
        id: updated.id,
        status: updated.status.toLowerCase(),
        cancelledAt: updated.cancelledAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error("POST /api/appointment/cancel error:", error);
    return NextResponse.json(
      { error: "Failed to cancel appointment" },
      { status: 500 }
    );
  }
}