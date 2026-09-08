import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { clientIp, consume } from "@/lib/rate-limit";

/**
 * Autenticação do canal de marcação pública (website institucional).
 *
 * O endpoint é *público para o visitante* mas nunca para a Internet: o site
 * institucional fala com o Pulso servidor-a-servidor com o token de um
 * `ApiClient` registado, exactamente como a API FHIR. O token vive apenas no
 * servidor do website; o browser do visitante nunca lhe toca.
 *
 * Scopes no espírito SMART on FHIR:
 *   - leitura do catálogo/disponibilidade: `system/Appointment.read`
 *   - criação da marcação:                 `system/Appointment.write`
 *
 * Dois baldes de rate limiting: um por cliente (trava um site comprometido a
 * inundar a agenda) e outro pelo IP do visitante reencaminhado pelo website em
 * `X-Visitor-Ip` (trava um visitante a martelar o formulário).
 */

const READ_LIMIT = Number(process.env.PUBLIC_BOOKING_READ_LIMIT ?? 240);
const WRITE_LIMIT = Number(process.env.PUBLIC_BOOKING_WRITE_LIMIT ?? 30);
const VISITOR_WRITE_LIMIT = Number(process.env.PUBLIC_BOOKING_VISITOR_LIMIT ?? 5);
const WINDOW_MS = 60_000;

export interface PublicBookingPrincipal {
  clientId: string;
  clientName: string;
  clinicId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export type PublicBookingOperation = "read" | "write";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function scopesFor(operation: PublicBookingOperation): string[] {
  const verb = operation === "write" ? "write" : "read";
  return [`system/Appointment.${verb}`, `system/*.${verb}`, "system/Appointment.*", "system/*.*"];
}

function json(body: unknown, status: number, extraHeaders?: HeadersInit) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

export function publicBookingUnavailable() {
  return json({ error: "A marcação online está temporariamente indisponível." }, 503);
}

/** IP do visitante, reencaminhado pelo website. Cai para o IP do pedido. */
export function visitorIp(request: Request): string {
  const forwarded = request.headers.get("x-visitor-ip");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
  return clientIp(request.headers);
}

export type PublicBookingAuth =
  | { ok: true; principal: PublicBookingPrincipal }
  | { ok: false; response: Response };

/** Autentica o pedido do website e aplica os limites de taxa. Nunca lança. */
export async function authenticatePublicBooking(
  request: Request,
  operation: PublicBookingOperation,
): Promise<PublicBookingAuth> {
  if (process.env.PUBLIC_BOOKING_ENABLED === "false") {
    return { ok: false, response: publicBookingUnavailable() };
  }

  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token || token.length < 24) {
    return { ok: false, response: json({ error: "Credencial do canal público inválida." }, 401) };
  }

  const tokenHash = hashToken(token);
  const gate = consume(
    `public-booking:${operation}:${tokenHash.slice(0, 16)}`,
    operation === "write" ? WRITE_LIMIT : READ_LIMIT,
    WINDOW_MS,
  );
  if (!gate.allowed) {
    return {
      ok: false,
      response: json({ error: "Demasiados pedidos. Tente novamente dentro de instantes." }, 429, {
        "Retry-After": String(gate.retryAfterSeconds),
      }),
    };
  }

  if (operation === "write") {
    const visitor = consume(`public-booking:visitor:${visitorIp(request)}`, VISITOR_WRITE_LIMIT, WINDOW_MS);
    if (!visitor.allowed) {
      return {
        ok: false,
        response: json({ error: "Já enviou vários pedidos seguidos. Aguarde um momento antes de tentar de novo." }, 429, {
          "Retry-After": String(visitor.retryAfterSeconds),
        }),
      };
    }
  }

  const client = await prisma.apiClient.findUnique({
    where: { tokenHash },
    select: { id: true, name: true, clinicId: true, scopes: true, isActive: true, expiresAt: true, lastUsedAt: true },
  });
  if (!client || !client.isActive || (client.expiresAt && client.expiresAt <= new Date())) {
    return { ok: false, response: json({ error: "Credencial do canal público inválida." }, 401) };
  }

  const accepted = scopesFor(operation);
  if (!client.scopes.some((scope) => accepted.includes(scope))) {
    return { ok: false, response: json({ error: "Este cliente não tem permissão para esta operação." }, 403) };
  }

  if (!client.lastUsedAt || Date.now() - client.lastUsedAt.getTime() > 5 * 60_000) {
    await prisma.apiClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } });
  }

  return {
    ok: true,
    principal: {
      clientId: client.id,
      clientName: client.name,
      clinicId: client.clinicId,
      ipAddress: visitorIp(request),
      userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
      requestId: request.headers.get("x-request-id"),
    },
  };
}
