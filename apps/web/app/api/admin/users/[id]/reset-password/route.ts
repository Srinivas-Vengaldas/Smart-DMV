import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { getRequestIp } from "@/lib/request-ip"

async function requireAdmin() {
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

  if (session.role !== "ADMIN") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return { session }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await context.params

    // ⭐ ADDED: IP + existingUser lookup
    const ipAddress = await getRequestIp()

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
      },
    })

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const body = await req.json()
    const password = String(body.password || "").trim()

    if (!password) {
      return NextResponse.json(
        { error: "New password is required" },
        { status: 400 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
      },
    })

    // ⭐ ADDED: audit log for successful reset
    await createAuditLog({
      action: "Password reset",
      actorId: auth.session.userId,
      actorEmail: auth.session.email,
      target: existingUser.email,
      ipAddress,
      status: "SUCCESS",
      category: "USER",
      metadata: {
        resetUserId: existingUser.id,
        resetUserRole: existingUser.role,
      },
    })

    return NextResponse.json({
      success: true,
      temporaryPassword: password,
    })
  } catch (error) {
    console.error("POST /api/admin/users/[id]/reset-password error:", error)
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 })
  }
}
