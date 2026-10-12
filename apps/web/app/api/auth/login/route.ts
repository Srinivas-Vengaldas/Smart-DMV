import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession } from "@/lib/auth";
import { getRequestIp } from "@/lib/request-ip";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      await prisma.auditLog.create({
        data: {
          action: "Login failed",
          actorEmail: String(email || "").toLowerCase().trim() || "Unknown",
          target: "System",
          ipAddress: "Unknown",
          status: "FAILED",
          category: "LOGIN",
          metadata: {
            reason: "Missing email or password",
            source: "login-route-direct",
          },
        },
      });

      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const ipAddress = await getRequestIp();
    const normalizedEmail = String(email).toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      await prisma.auditLog.create({
        data: {
          action: "Login failed",
          actorEmail: normalizedEmail,
          target: "System",
          ipAddress,
          status: "FAILED",
          category: "LOGIN",
          metadata: {
            reason: "User not found",
            source: "login-route-direct",
          },
        },
      });

      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      await prisma.auditLog.create({
        data: {
          action: "Login failed",
          actorId: user.id,
          actorEmail: user.email,
          target: "System",
          ipAddress,
          status: "FAILED",
          category: "LOGIN",
          metadata: {
            reason: "Invalid password",
            source: "login-route-direct",
          },
        },
      });

      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const token = signSession({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const safeUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`,
      phone: user.phone,
      address: user.address,
      city: user.city,
      zip: user.zip,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };

    await prisma.auditLog.create({
      data: {
        action: "User login",
        actorId: user.id,
        actorEmail: user.email,
        target: "System",
        ipAddress,
        status: "SUCCESS",
        category: "LOGIN",
        metadata: {
          role: user.role,
          source: "login-route-direct",
        },
      },
    });

    const res = NextResponse.json({
      ok: true,
      user: safeUser,
    });

    res.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (error) {
    console.error("POST /api/auth/login error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Login failed",
      },
      { status: 500 }
    );
  }
}