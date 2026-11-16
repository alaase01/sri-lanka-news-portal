import "server-only";
import { db } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Append-only record of administrative actions. Never pass passwords, tokens,
 * article text or anything a reader submitted in `meta`.
 */
export async function audit(entry: {
  adminId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  ip?: string | null;
  meta?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        adminId: entry.adminId ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        ip: entry.ip ?? null,
        meta: entry.meta,
      },
    });
  } catch (error) {
    // A failed audit write must not break the action, but it must be visible in server logs.
    console.error("audit log write failed", entry.action, error instanceof Error ? error.message : "unknown error");
  }
}
