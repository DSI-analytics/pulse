import type { NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { consume } from "@/lib/rate-limit";
import { searchIcd } from "@/server/icd11";
import { getTranslator, getUiContext } from "@/i18n/server";

/**
 * Pesquisa na CID-11 (ICD-11) da OMS para o selector de diagnóstico.
 *
 * Ordem obrigatória: sessão → permissão → limite de pedidos → pesquisa.
 * Só lê catálogo público da OMS (e a cache local) — não devolve nem escreve
 * dados de pacientes, mas exige sessão e permissão clínica na mesma.
 */

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const t = await getTranslator();
  const user = await getAuthorizedUser();
  if (!user) return json({ error: t("clinical.documents.invalidSession") }, 401);

  if (!can(user.role, "consultation.conduct") && !can(user.role, "encounter.manage")) {
    return json({ error: t("clinical.errors.noPermission") }, 403);
  }

  const gate = consume(`icd11:${user.userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!gate.allowed) {
    return Response.json(
      { error: t("clinical.icd.searchError") },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  const { locale } = await getUiContext();
  const result = await searchIcd(query, locale);
  if ("error" in result) return json(result, 400);
  return json({ hits: result.hits, degraded: result.degraded });
}
