import "server-only";
import type { AuditResult, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Consulta do registo de auditoria. Leitura apenas — não existe caminho de
 * escrita ou de eliminação na aplicação, e a base de dados rejeita UPDATE e
 * DELETE nesta tabela.
 */

export interface AuditFilters {
  q?: string;
  userId?: string;
  action?: string;
  module?: string;
  entity?: string;
  entityId?: string;
  result?: AuditResult;
  ip?: string;
  from?: Date | null;
  to?: Date | null;
  page?: number;
  pageSize?: number;
}

export const AUDIT_PAGE_SIZE = 40;

export function buildAuditWhere(clinicId: string, filters: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = { clinicId };

  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = filters.action;
  if (filters.module) where.module = filters.module;
  if (filters.entity) where.entity = filters.entity;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.result) where.result = filters.result;
  if (filters.ip) where.ipAddress = { contains: filters.ip };
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const term = (filters.q ?? "").trim();
  if (term.length >= 2) {
    where.OR = [
      { action: { contains: term, mode: "insensitive" } },
      { entity: { contains: term, mode: "insensitive" } },
      { entityId: { contains: term, mode: "insensitive" } },
      { userName: { contains: term, mode: "insensitive" } },
      { requestId: { contains: term, mode: "insensitive" } },
      { endpoint: { contains: term, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function getAuditPage(clinicId: string, filters: AuditFilters) {
  const pageSize = Math.min(filters.pageSize ?? AUDIT_PAGE_SIZE, 100);
  const page = Math.max(1, filters.page ?? 1);
  const where = buildAuditWhere(clinicId, filters);

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, createdAt: true, action: true, module: true, entity: true, entityId: true,
        userId: true, userName: true, userRole: true, result: true, ipAddress: true, userAgent: true,
        sessionId: true, requestId: true, endpoint: true, httpMethod: true, before: true, after: true, metadata: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Valores distintos para alimentar os filtros, limitados para não pesar. */
export async function getAuditFilterOptions(clinicId: string) {
  const [actions, modules, entities, users] = await Promise.all([
    prisma.auditLog.groupBy({ by: ["action"], where: { clinicId }, _count: { _all: true }, orderBy: { _count: { action: "desc" } }, take: 60 }),
    prisma.auditLog.groupBy({ by: ["module"], where: { clinicId }, _count: { _all: true }, orderBy: { module: "asc" }, take: 30 }),
    prisma.auditLog.groupBy({ by: ["entity"], where: { clinicId }, _count: { _all: true }, orderBy: { entity: "asc" }, take: 40 }),
    prisma.user.findMany({ where: { clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return {
    actions: actions.map((a) => a.action).sort(),
    modules: modules.map((m) => m.module).filter((m): m is string => Boolean(m)).sort(),
    entities: entities.map((e) => e.entity).sort(),
    users,
  };
}
