import { prisma } from "@/lib/prisma"

export type AuditStatus = "SUCCESS" | "FAILED"
export type AuditCategory =
  | "LOGIN"
  | "DOCUMENT"
  | "USER"
  | "CONFIG"
  | "REPORT"
  | "SYSTEM"

interface CreateAuditLogInput {
  action: string
  actorId?: string | null
  actorEmail?: string | null
  target?: string | null
  ipAddress?: string | null
  status?: AuditStatus
  category: AuditCategory
  metadata?: unknown
}

export async function createAuditLog(input: CreateAuditLogInput) {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      target: input.target ?? null,
      ipAddress: input.ipAddress ?? null,
      status: input.status ?? "SUCCESS",
      category: input.category,
      metadata:
        input.metadata && typeof input.metadata === "object"
          ? input.metadata
          : undefined,
    },
  })
}