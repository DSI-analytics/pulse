import type { NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { getAuthorizedUser, resolveClinicScope } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { clientIp, consume } from "@/lib/rate-limit";
import { answerQuestion } from "@/server/insights-assistant";

/**
 * Endpoint do assistente de Insights.
 *
 * Ordem obrigatória: sessão → permissão → âmbito institucional → métrica.
 * O `clinicId` é resolvido a partir da sessão (`resolveClinicScope`), pelo que
 * um `clinicId` enviado no corpo do pedido só é honrado se o utilizador tiver
 * autorização explícita sobre essa instituição — caso contrário é ignorado em
 * silêncio e usada a clínica de origem.
 *
 * A aba Insights é read-only: este endpoint não escreve dados de negócio.
 */

const RATE_LIMIT = Number(process.env.AI_RATE_LIMIT ?? 20);
const RATE_WINDOW_MS = 60_000;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getAuthorizedUser();
  if (!user) return json({ error: "Sessão inválida." }, 401);

  if (!can(user.role, "insights.view")) {
    await audit({
      clinicId: user.clinicId,
      userId: user.userId,
      userName: user.name,
      userRole: user.role,
      sessionId: user.sessionId ?? null,
      action: "insights.chat",
      module: "insights",
      entity: "Insights",
      result: "NEGADO",
    });
    return json({ error: "Sem permissão para aceder aos Insights." }, 403);
  }

  const gate = consume(`insights:${user.userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!gate.allowed) {
    return Response.json(
      { error: "Demasiados pedidos. Tente novamente dentro de instantes." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Pedido inválido." }, 400);
  }

  const payload = body as { question?: unknown; clinicId?: unknown };
  const question = typeof payload.question === "string" ? payload.question : "";
  if (!question.trim()) return json({ error: "Escreva uma pergunta." }, 400);

  const requestedClinicId = typeof payload.clinicId === "string" ? payload.clinicId : null;
  const { clinicId } = await resolveClinicScope(user, requestedClinicId);
  const crossTenantAttempt = Boolean(requestedClinicId && requestedClinicId !== clinicId);

  const result = await answerQuestion(user, clinicId, question);

  await audit({
    clinicId,
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    sessionId: user.sessionId ?? null,
    action: "insights.chat",
    module: "insights",
    entity: "Insights",
    result: "error" in result ? "FALHA" : "SUCESSO",
    request: {
      ipAddress: clientIp(request.headers),
      userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
      requestId: request.headers.get("x-request-id"),
      endpoint: "/api/insights/chat",
      httpMethod: "POST",
    },
    metadata: {
      // A pergunta é registada truncada, para rastreabilidade; a resposta não é
      // guardada no log para não duplicar dados de negócio.
      question: question.slice(0, 200),
      metric: "error" in result ? null : (result.answer.metric?.id ?? null),
      denied: "error" in result ? null : (result.answer.denied ?? null),
      crossTenantAttempt,
    },
  });

  if ("error" in result) return json(result, 400);
  return json(result.answer);
}
