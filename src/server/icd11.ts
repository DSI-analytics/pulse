import "server-only";
import { prisma } from "@/lib/prisma";
import { isValidIcdCode, normaliseIcdCode, normaliseSearchText, stripHighlight } from "@/lib/domain/icd";
import { getTranslator, getUiContext } from "@/i18n/server";
import { DEFAULT_LOCALE } from "@/i18n/config";

/**
 * Cliente da CID-11 (ICD-11) da Organização Mundial da Saúde.
 *
 * O catálogo NUNCA é inventado nem escrito à mão: vem da API da OMS
 * (`https://id.who.int`) ou de uma instalação local da OMS — o mesmo contrato
 * de endpoints, sem autenticação. Os códigos usados pela clínica ficam em
 * cache local (`IcdCode`) para que a escolha do diagnóstico continue possível
 * quando a OMS estiver inacessível (modo degradado).
 *
 * As credenciais vivem apenas no ambiente (`ICD_API_CLIENT_ID` /
 * `ICD_API_CLIENT_SECRET`) — nunca na base de dados nem no cliente.
 */

const DEFAULT_BASE_URL = "https://id.who.int";
const DEFAULT_TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token";
const DEFAULT_RELEASE = "2026-01";
const LINEARIZATION = "mms";
const TIMEOUT_MS = 6_000;
/** Margem de segurança antes de o token expirar. */
const TOKEN_SKEW_MS = 60_000;
const MAX_HITS = 20;

export interface IcdHit {
  code: string;
  title: string;
  uri: string | null;
  chapter: string | null;
  release: string;
  source: "who" | "cache";
}

interface IcdConfig {
  baseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  release: string;
  language: string | null;
  /** Instalação local da OMS: mesmo contrato, sem passo de autenticação. */
  local: boolean;
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function icdConfig(): IcdConfig {
  const baseUrl = (env("ICD_API_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const clientId = env("ICD_API_CLIENT_ID");
  const clientSecret = env("ICD_API_CLIENT_SECRET");
  return {
    baseUrl,
    tokenUrl: env("ICD_API_TOKEN_URL") || DEFAULT_TOKEN_URL,
    clientId,
    clientSecret,
    release: env("ICD_API_RELEASE") || DEFAULT_RELEASE,
    language: env("ICD_API_LANGUAGE") || null,
    local: !clientId || !clientSecret,
  };
}

/**
 * Há forma de consultar a OMS? Verdadeiro com credenciais (API pública) ou
 * quando está configurada uma instalação local (base diferente da pública).
 */
export function icdConfigured(): boolean {
  const config = icdConfig();
  if (config.clientId && config.clientSecret) return true;
  return config.baseUrl !== DEFAULT_BASE_URL;
}

/** Idioma efectivo dos títulos: o do ambiente, senão o da interface. */
async function resolveLanguage(preferred?: string): Promise<string> {
  const config = icdConfig();
  if (config.language) return config.language;
  if (preferred) return preferred;
  try {
    return (await getUiContext()).locale;
  } catch {
    return DEFAULT_LOCALE;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Autenticação (OAuth2 client_credentials)
// ─────────────────────────────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

/** Token da OMS, em cache na memória do processo até perto da expiração. */
async function accessToken(config: IcdConfig): Promise<string | null> {
  if (config.local) return null;
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - TOKEN_SKEW_MS > now) return tokenCache.token;

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "icdapi_access" }).toString(),
  });
  if (!response.ok) throw new Error(`ICD token ${response.status}`);

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("ICD token sem access_token");
  tokenCache = {
    token: payload.access_token,
    expiresAt: now + Math.max(Number(payload.expires_in ?? 3600), 60) * 1000,
  };
  return tokenCache.token;
}

async function icdFetch(config: IcdConfig, path: string, language: string): Promise<Response> {
  const token = await accessToken(config);
  const url = path.startsWith("http") ? path : `${config.baseUrl}${path}`;
  return fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "API-Version": "v2",
      Accept: "application/json",
      "Accept-Language": `${language}, en;q=0.8`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** Reescreve um URI da OMS para a base configurada (instalação local). */
function onBase(config: IcdConfig, uri: string): string {
  try {
    const parsed = new URL(uri);
    return `${config.baseUrl}${parsed.pathname}`;
  } catch {
    return `${config.baseUrl}${uri.startsWith("/") ? uri : `/${uri}`}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado (página de integrações)
// ─────────────────────────────────────────────────────────────────────────────

export async function icdStatus(): Promise<{
  configured: boolean;
  baseUrl: string;
  release: string;
  language: string;
  reachable: boolean;
  error: string | null;
}> {
  const config = icdConfig();
  const language = await resolveLanguage();
  const base = { configured: icdConfigured(), baseUrl: config.baseUrl, release: config.release, language };
  if (!base.configured) return { ...base, reachable: false, error: null };

  try {
    const response = await icdFetch(config, `/icd/release/11/${config.release}/${LINEARIZATION}`, language);
    if (!response.ok) return { ...base, reachable: false, error: `HTTP ${response.status}` };
    return { ...base, reachable: true, error: null };
  } catch (error) {
    return { ...base, reachable: false, error: error instanceof Error ? error.message.slice(0, 200) : "erro" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pesquisa
// ─────────────────────────────────────────────────────────────────────────────

interface WhoEntity {
  id?: string;
  title?: string;
  theCode?: string;
  chapter?: string;
}

async function searchWho(config: IcdConfig, query: string, language: string): Promise<IcdHit[]> {
  const path = `/icd/release/11/${config.release}/${LINEARIZATION}/search?q=${encodeURIComponent(query)}&flatResults=true`;
  const response = await icdFetch(config, path, language);
  if (!response.ok) throw new Error(`ICD search ${response.status}`);

  const payload = (await response.json()) as { destinationEntities?: WhoEntity[] };
  const hits: IcdHit[] = [];
  for (const entity of payload.destinationEntities ?? []) {
    const code = normaliseIcdCode(stripHighlight(entity.theCode ?? ""));
    // Capítulos e blocos não têm código atribuível — não são diagnosticáveis.
    if (!isValidIcdCode(code)) continue;
    hits.push({
      code,
      title: stripHighlight(entity.title ?? ""),
      uri: entity.id ?? null,
      chapter: entity.chapter ? stripHighlight(entity.chapter) : null,
      release: config.release,
      source: "who",
    });
    if (hits.length >= MAX_HITS) break;
  }
  return hits;
}

/** Pesquisa na cache local — o que a clínica já usou continua disponível. */
async function searchCache(query: string, language: string, release: string): Promise<IcdHit[]> {
  const term = normaliseSearchText(query);
  if (!term) return [];
  const rows = await prisma.icdCode.findMany({
    where: {
      linearization: LINEARIZATION,
      language,
      OR: [{ searchText: { contains: term } }, { code: { startsWith: normaliseIcdCode(query) } }],
    },
    orderBy: [{ usageCount: "desc" }, { title: "asc" }],
    take: MAX_HITS,
    select: { code: true, title: true, uri: true, chapter: true, release: true },
  });
  return rows.map((row) => ({
    code: row.code,
    title: row.title,
    uri: row.uri,
    chapter: row.chapter,
    release: row.release || release,
    source: "cache" as const,
  }));
}

function merge(primary: IcdHit[], secondary: IcdHit[]): IcdHit[] {
  const seen = new Set<string>();
  const out: IcdHit[] = [];
  for (const hit of [...primary, ...secondary]) {
    if (seen.has(hit.code)) continue;
    seen.add(hit.code);
    out.push(hit);
    if (out.length >= MAX_HITS) break;
  }
  return out;
}

/**
 * Pesquisa um termo na CID-11.
 *
 * A cache local é sempre consultada e fundida com a resposta da OMS (a OMS
 * primeiro, sem códigos repetidos). Qualquer falha da OMS devolve apenas a
 * cache, com `degraded: true` — o médico continua a poder codificar.
 */
export async function searchIcd(
  query: string,
  language: string,
): Promise<{ ok: true; hits: IcdHit[]; degraded: boolean } | { error: string }> {
  const term = String(query ?? "").trim().slice(0, 200);
  const config = icdConfig();
  const lang = await resolveLanguage(language);
  if (term.length < 2) return { ok: true, hits: [], degraded: false };

  const cached = await searchCache(term, lang, config.release).catch(() => [] as IcdHit[]);

  if (!icdConfigured()) {
    if (cached.length) return { ok: true, hits: cached, degraded: true };
    const t = await getTranslator();
    return { error: t("clinical.icd.notConfigured") };
  }

  try {
    const hits = await searchWho(config, term, lang);
    return { ok: true, hits: merge(hits, cached), degraded: false };
  } catch {
    // A OMS falhou (rede, token, indisponibilidade): serve-se a cache local.
    return { ok: true, hits: cached, degraded: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache local
// ─────────────────────────────────────────────────────────────────────────────

/** Guarda (ou refresca) um código escolhido e conta a utilização. */
export async function rememberIcdCode(hit: IcdHit, language: string): Promise<void> {
  const code = normaliseIcdCode(hit.code);
  if (!isValidIcdCode(code)) return;
  const lang = await resolveLanguage(language);
  const release = hit.release || icdConfig().release;
  const title = stripHighlight(hit.title);

  try {
    await prisma.icdCode.upsert({
      where: {
        release_linearization_language_code: { release, linearization: LINEARIZATION, language: lang, code },
      },
      create: {
        release,
        linearization: LINEARIZATION,
        language: lang,
        code,
        title,
        uri: hit.uri,
        chapter: hit.chapter,
        searchText: normaliseSearchText(`${code} ${title}`),
        usageCount: 1,
      },
      update: {
        title,
        uri: hit.uri ?? undefined,
        chapter: hit.chapter ?? undefined,
        searchText: normaliseSearchText(`${code} ${title}`),
        usageCount: { increment: 1 },
        syncedAt: new Date(),
      },
    });
  } catch {
    // A cache é um acelerador: nunca deve fazer falhar o registo clínico.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Consulta de um código
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confirma que um código existe no catálogo e devolve o título oficial.
 * A cache local responde primeiro; só depois se pergunta à OMS.
 */
export async function lookupIcdCode(code: string, language: string): Promise<IcdHit | null> {
  const wanted = normaliseIcdCode(code);
  if (!isValidIcdCode(wanted)) return null;
  const config = icdConfig();
  const lang = await resolveLanguage(language);

  const cached = await prisma.icdCode
    .findFirst({
      where: { code: wanted, linearization: LINEARIZATION, language: lang },
      orderBy: { syncedAt: "desc" },
      select: { code: true, title: true, uri: true, chapter: true, release: true },
    })
    .catch(() => null);
  if (cached) {
    return {
      code: cached.code,
      title: cached.title,
      uri: cached.uri,
      chapter: cached.chapter,
      release: cached.release || config.release,
      source: "cache",
    };
  }

  if (!icdConfigured()) return null;

  try {
    const info = await icdFetch(config, `/icd/release/11/${config.release}/${LINEARIZATION}/codeinfo/${encodeURIComponent(wanted)}`, lang);
    if (!info.ok) return null;
    const payload = (await info.json()) as { stemId?: string };
    if (!payload.stemId) return null;

    const entity = await icdFetch(config, onBase(config, payload.stemId), lang);
    if (!entity.ok) return null;
    const detail = (await entity.json()) as { "@id"?: string; code?: string; title?: { "@value"?: string } | string };
    const title = stripHighlight(typeof detail.title === "string" ? detail.title : (detail.title?.["@value"] ?? ""));
    if (!title) return null;

    return {
      code: normaliseIcdCode(detail.code || wanted),
      title,
      uri: detail["@id"] ?? payload.stemId,
      chapter: null,
      release: config.release,
      source: "who",
    };
  } catch {
    return null;
  }
}
