import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { getRequestIp } from "@/lib/request-ip"

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

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
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

    return NextResponse.json({
      success: true,
      users: users.map(toSafeUser),
    })
  } catch (error) {
    console.error("GET /api/admin/users error:", error)
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const body = await req.json()
    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      zip,
      password,
      role,
    } = body as {
      firstName?: string
      lastName?: string
      email?: string
      phone?: string
      address?: string
      city?: string
      zip?: string
      password?: string
      role?: "RESIDENT" | "STAFF" | "ADMIN"
    }

    const ipAddress = await getRequestIp()

    if (!firstName || !lastName || !email || !password || !role) {
      return NextResponse.json(
        { error: "firstName, lastName, email, password, and role are required" },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    })

    if (existing) {
      await createAuditLog({
        action: "User creation failed",
        actorId: auth.session.userId,
        actorEmail: auth.session.email,
        target: normalizedEmail,
        ipAddress,
        status: "FAILED",
        category: "USER",
        metadata: { reason: "Email already exists" },
      })

      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const created = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        phone: phone?.trim() || "",
        address: address?.trim() || null,
        city: city?.trim() || null,
        zip: zip?.trim() || null,
        password: hashedPassword,
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

    await createAuditLog({
      action: "User created",
      actorId: auth.session.userId,
      actorEmail: auth.session.email,
      target: created.email,
      ipAddress,
      status: "SUCCESS",
      category: "USER",
      metadata: {
        createdUserId: created.id,
        role: created.role,
      },
    })

    return NextResponse.json({
      success: true,
      user: toSafeUser(created),
    })
  } catch (error) {
    console.error("POST /api/admin/users error:", error)
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
  }
}
