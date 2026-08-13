import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

/**
 * Record an auditable action. Never stores patient-sensitive payloads — only
 * identifiers and safe metadata (e.g. status transitions).
 */
export async function audit(params: {
  clinicId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        clinicId: params.clinicId,
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        metadata: params.metadata,
      },
    });
  } catch {
    // Auditing must never break the primary operation.
  }
}
