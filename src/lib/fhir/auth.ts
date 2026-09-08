import "server-only";
import { createHash } from "node:crypto";
import type { UserRole } from "@prisma/client";
import { audit } from "@/lib/audit";
import { getAuthorizedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { clientIp, consume } from "@/lib/rate-limit";
import { errors } from "./outcome";
import type { FhirResourceType } from "./ids";

/**
 * Segurança da API FHIR (§20).
 *
 * Dois modos de autenticação, ambos obrigatórios — não existe endpoint FHIR
 * público:
 *   1. `Authorization: Bearer <token>` de um `ApiClient` registado (o token é
 *      guardado apenas como hash SHA-256);
 *   2. a sessão da própria aplicação, para utilizadores com `fhir.access`.
 *
 * A autorização é feita por scopes no formato SMART on FHIR
 * (`system/Patient.read`, `system/*.write`), pelo que a migração para OAuth
 * 2.0 / OpenID Connect não obriga a alterar os handlers: muda apenas a forma
 * como o principal é obtido.
 */

const RATE_LIMIT = Number(process.env.FHIR_RATE_LIMIT ?? 120);
const RATE_WINDOW_MS = 60_000;

export type FhirOperation = "read" | "search" | "write";

export interface FhirPrincipal {
  kind: "api-client" | "user";
  id: string;
  name: string;
  clinicId: string;
  scopes: string[];
  userId: string | null;
  userRole: UserRole | null;
  sessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

function scopeFor(resourceType: FhirResourceType, operation: FhirOperation): string[] {
  const verb = operation === "write" ? "write" : "read";
  return [`system/${resourceType}.${verb}`, `system/*.${verb}`, `system/${resourceType}.*`, "system/*.*"];
}

export function hasScope(principal: FhirPrincipal, resourceType: FhirResourceType, operation: FhirOperation): boolean {
  const accepted = scopeFor(resourceType, operation);
  return principal.scopes.some((scope) => accepted.includes(scope));
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type AuthOutcome = { ok: true; principal: FhirPrincipal } | { ok: false; response: Response };

/** Autentica o pedido e aplica o limite de taxa. Nunca lança. */
export async function authenticateFhir(request: Request): Promise<AuthOutcome> {
  if (process.env.FHIR_ENABLED === "false") {
    return { ok: false, response: errors.notSupported("A API FHIR está desactivada nesta instalação.") };
  }

  const headers = request.headers;
  const ip = clientIp(headers);
  const userAgent = headers.get("user-agent")?.slice(0, 512) ?? null;
  const requestId = headers.get("x-request-id");

  const authorization = headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() === "bearer" && token) {
    const gate = consume(`fhir:token:${hashToken(token).slice(0, 16)}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!gate.allowed) return { ok: false, response: errors.throttled(gate.retryAfterSeconds) };

    const client = await prisma.apiClient.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, name: true, clinicId: true, scopes: true, isActive: true, expiresAt: true, lastUsedAt: true },
    });
    if (!client || !client.isActive || (client.expiresAt && client.expiresAt <= new Date())) {
      return { ok: false, response: errors.unauthorized() };
    }
    if (!client.lastUsedAt || Date.now() - client.lastUsedAt.getTime() > 5 * 60_000) {
      await prisma.apiClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } });
    }
    return {
      ok: true,
      principal: {
        kind: "api-client",
        id: client.id,
        name: client.name,
        clinicId: client.clinicId,
        scopes: client.scopes,
        userId: null,
        userRole: null,
        sessionId: null,
        ipAddress: ip,
        userAgent,
        requestId,
      },
    };
  }

  // Sessão da aplicação: útil para o próprio produto consumir a API e para
  // ferramentas de diagnóstico, sem abrir o endpoint a terceiros.
  const user = await getAuthorizedUser();
  if (!user) return { ok: false, response: errors.unauthorized() };
  if (!can(user.role, "fhir.access")) return { ok: false, response: errors.forbidden("O seu perfil não tem acesso à API FHIR.") };

  const gate = consume(`fhir:user:${user.userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!gate.allowed) return { ok: false, response: errors.throttled(gate.retryAfterSeconds) };

  return {
    ok: true,
    principal: {
      kind: "user",
      id: user.userId,
      name: user.name,
      clinicId: user.clinicId,
      // Um utilizador autenticado herda os scopes correspondentes às suas
      // permissões: leitura sempre, escrita apenas com permissões clínicas.
      scopes: can(user.role, "encounter.manage") ? ["system/*.read", "system/*.write"] : ["system/*.read"],
      userId: user.userId,
      userRole: user.role,
      sessionId: user.sessionId ?? null,
      ipAddress: ip,
      userAgent,
      requestId,
    },
  };
}

/** Toda a operação FHIR gera um evento de auditoria (§19). */
export async function auditFhir(
  principal: FhirPrincipal,
  params: {
    resourceType: string;
    operation: string;
    entityId?: string | null;
    result?: "SUCESSO" | "FALHA" | "NEGADO";
    endpoint: string;
    method: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await audit({
    clinicId: principal.clinicId,
    userId: principal.userId,
    userName: principal.kind === "api-client" ? `API: ${principal.name}` : principal.name,
    userRole: principal.userRole,
    sessionId: principal.sessionId,
    action: `fhir.${params.operation}`,
    module: "fhir",
    entity: params.resourceType,
    entityId: params.entityId ?? null,
    result: params.result ?? "SUCESSO",
    request: {
      ipAddress: principal.ipAddress,
      userAgent: principal.userAgent,
      requestId: principal.requestId,
      endpoint: params.endpoint,
      httpMethod: params.method,
    },
    metadata: {
      client: principal.kind === "api-client" ? principal.name : "sessao",
      ...params.metadata,
    },
  });
}
