import "server-only";
import { headers } from "next/headers";
import type { AuditResult, Prisma, UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { changedFields, redact } from "./audit-redaction";

export { changedFields, redact };

/**
 * Centralised, append-only audit trail.
 *
 * Guarantees:
 *  - never throws into the caller (auditing must not break the operation);
 *  - never persists credentials (passwords, hashes, tokens, secrets);
 *  - never persists clinical free text — only the fact that it changed;
 *  - enriches every entry with request context (IP, user agent, request id,
 *    endpoint) when one is available.
 *
 * Immutability is enforced by a database trigger, not by convention. See
 * migration `harden_audit_log_immutability`.
 */

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  endpoint?: string | null;
  httpMethod?: string | null;
}

/** Best-effort request metadata. Returns empty values outside a request scope. */
export async function requestContext(): Promise<RequestContext> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    return {
      ipAddress: (forwarded ? forwarded.split(",")[0]?.trim() : null) || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
      requestId: h.get("x-request-id") ?? null,
      endpoint: h.get("x-pathname") ?? h.get("next-url") ?? null,
      httpMethod: h.get("x-http-method") ?? null,
    };
  } catch {
    return {};
  }
}

export interface AuditParams {
  clinicId: string;
  userId?: string | null;
  userName?: string | null;
  userRole?: UserRole | null;
  sessionId?: string | null;
  action: string;
  /** Functional area: "prontuario", "agenda", "financeiro", "auth", "fhir"… */
  module?: string | null;
  entity: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  result?: AuditResult;
  metadata?: Prisma.InputJsonValue;
  request?: RequestContext;
}

/** Record an auditable action. Never throws. */
export async function audit(params: AuditParams): Promise<void> {
  try {
    const ctx = params.request ?? (await requestContext());
    const diff =
      params.before || params.after ? changedFields(params.before, params.after) : { before: null, after: null };

    await prisma.auditLog.create({
      data: {
        clinicId: params.clinicId,
        userId: params.userId ?? null,
        userName: params.userName ?? null,
        userRole: params.userRole ?? null,
        module: params.module ?? moduleOf(params.action),
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        before: (diff.before as Prisma.InputJsonValue) ?? undefined,
        after: (diff.after as Prisma.InputJsonValue) ?? undefined,
        result: params.result ?? "SUCESSO",
        ipAddress: params.request?.ipAddress ?? ctx.ipAddress ?? null,
        userAgent: params.request?.userAgent ?? ctx.userAgent ?? null,
        sessionId: params.sessionId ?? null,
        requestId: params.request?.requestId ?? ctx.requestId ?? null,
        endpoint: params.request?.endpoint ?? ctx.endpoint ?? null,
        httpMethod: params.request?.httpMethod ?? ctx.httpMethod ?? null,
        metadata: params.metadata,
      },
    });
  } catch {
    // Auditing must never break the primary operation.
  }
}

const MODULE_BY_PREFIX: Record<string, string> = {
  user: "sistema",
  auth: "autenticacao",
  patient: "prontuario",
  encounter: "prontuario",
  consultation: "prontuario",
  vitals: "prontuario",
  diagnosis: "prontuario",
  allergy: "prontuario",
  prescription: "prontuario",
  lab: "laboratorio",
  laboratory: "laboratorio",
  procedure: "prontuario",
  admission: "prontuario",
  attachment: "documentos",
  appointment: "agenda",
  doctor: "gestao",
  specialty: "gestao",
  healthplan: "gestao",
  service: "gestao",
  invoice: "financeiro",
  payment: "financeiro",
  expense: "financeiro",
  revenue: "financeiro",
  inventory: "stock",
  supplier: "stock",
  purchase: "stock",
  fhir: "fhir",
  insights: "insights",
  audit: "sistema",
  settings: "sistema",
  export: "sistema",
};

function moduleOf(action: string): string {
  return MODULE_BY_PREFIX[action.split(".")[0] ?? ""] ?? "sistema";
}

/** Convenience wrapper that fills actor fields from a session user. */
export async function auditAs(
  actor: { userId: string; clinicId: string; name?: string; role?: UserRole; sessionId?: string | null },
  params: Omit<AuditParams, "clinicId" | "userId" | "userName" | "userRole" | "sessionId"> & { clinicId?: string },
): Promise<void> {
  await audit({
    ...params,
    clinicId: params.clinicId ?? actor.clinicId,
    userId: actor.userId,
    userName: actor.name ?? null,
    userRole: actor.role ?? null,
    sessionId: actor.sessionId ?? null,
  });
}
