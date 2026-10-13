import { NextResponse } from "next/server"
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

function toSafeUser(user: {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  zip: string | null
  role: string
  createdAt: Date
}) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    phone: user.phone ?? "",
    address: user.address ?? "",
    city: user.city ?? "",
    zip: user.zip ?? "",
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function PATCH(
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
        firstName: true,
        lastName: true,
      },
    })

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const body = await req.json()

    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      zip,
      role,
    } = body as {
      firstName?: string
      lastName?: string
      email?: string
      phone?: string
      address?: string
      city?: string
      zip?: string
      role?: "RESIDENT" | "STAFF" | "ADMIN"
    }

    if (auth.session.userId === id && role && role !== "ADMIN") {
      // ⭐ ADDED: log blocked self-role change
      await createAuditLog({
        action: "Protected role change blocked",
        actorId: auth.session.userId,
        actorEmail: auth.session.email,
        target: existingUser.email,
        ipAddress,
        status: "FAILED",
        category: "USER",
        metadata: { reason: "Attempted self admin downgrade" },
      })

      return NextResponse.json(
        { error: "You cannot change your own admin role" },
        { status: 400 }
      )
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        firstName: firstName?.trim(),
        lastName: lastName?.trim(),
        email: email?.toLowerCase().trim(),
        phone: phone !== undefined ? phone.trim() : undefined,
        address: address !== undefined ? address.trim() || null : undefined,
        city: city !== undefined ? city.trim() || null : undefined,
        zip: zip !== undefined ? zip.trim() || null : undefined,
        role,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        zip: true,
        role: true,
        createdAt: true,
      },
    })

    // ⭐ ADDED: success audit log
    await createAuditLog({
      action: "User updated",
      actorId: auth.session.userId,
      actorEmail: auth.session.email,
      target: updated.email,
      ipAddress,
      status: "SUCCESS",
      category: "USER",
      metadata: {
        updatedUserId: updated.id,
        previousRole: existingUser.role,
        newRole: updated.role,
      },
    })

    return NextResponse.json({
      success: true,
      user: toSafeUser(updated),
    })
  } catch (error) {
    console.error("PATCH /api/admin/users/[id] error:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
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

    if (auth.session.userId === id) {
      // ⭐ ADDED: log blocked self-delete
      await createAuditLog({
        action: "Protected account deletion blocked",
        actorId: auth.session.userId,
        actorEmail: auth.session.email,
        target: existingUser.email,
        ipAddress,
        status: "FAILED",
        category: "USER",
        metadata: { reason: "Attempted self deletion" },
      })

      return NextResponse.json(
        { error: "You cannot delete your own admin account" },
        { status: 400 }
      )
    }

    await prisma.user.delete({
      where: { id },
    })

    // ⭐ ADDED: success delete log
    await createAuditLog({
      action: "User deleted",
      actorId: auth.session.userId,
      actorEmail: auth.session.email,
      target: existingUser.email,
      ipAddress,
      status: "SUCCESS",
      category: "USER",
      metadata: {
        deletedUserId: existingUser.id,
        deletedUserRole: existingUser.role,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/admin/users/[id] error:", error)
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
}
