// Respostas FHIR: OperationOutcome e Bundle de pesquisa.
//
// Todas as respostas — incluindo erros — usam `application/fhir+json`, como
// exige a especificação. Nenhuma mensagem de erro revela dados clínicos.

export const FHIR_CONTENT_TYPE = "application/fhir+json; charset=utf-8";

export type IssueSeverity = "fatal" | "error" | "warning" | "information";

export type IssueCode =
  | "invalid"
  | "structure"
  | "required"
  | "value"
  | "not-supported"
  | "security"
  | "login"
  | "unknown"
  | "forbidden"
  | "processing"
  | "not-found"
  | "conflict"
  | "throttled"
  | "exception";

export interface OperationIssue {
  severity: IssueSeverity;
  code: IssueCode;
  diagnostics: string;
  expression?: string[];
}

export function operationOutcome(issues: OperationIssue[]) {
  return {
    resourceType: "OperationOutcome" as const,
    issue: issues.map((i) => ({
      severity: i.severity,
      code: i.code,
      diagnostics: i.diagnostics,
      ...(i.expression ? { expression: i.expression } : {}),
    })),
  };
}

export function fhirJson(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": FHIR_CONTENT_TYPE,
      "Cache-Control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

export function fhirError(status: number, issues: OperationIssue[] | OperationIssue, headers?: HeadersInit): Response {
  return fhirJson(operationOutcome(Array.isArray(issues) ? issues : [issues]), { status, headers });
}

export const errors = {
  unauthorized: () =>
    fhirError(401, { severity: "error", code: "login", diagnostics: "Autenticação necessária." }, { "WWW-Authenticate": "Bearer" }),
  forbidden: (detail = "Sem autorização para este recurso.") =>
    fhirError(403, { severity: "error", code: "forbidden", diagnostics: detail }),
  notFound: (detail = "Recurso não encontrado.") =>
    fhirError(404, { severity: "error", code: "not-found", diagnostics: detail }),
  notSupported: (detail: string) =>
    fhirError(405, { severity: "error", code: "not-supported", diagnostics: detail }),
  invalid: (issues: OperationIssue[]) => fhirError(400, issues),
  throttled: (retryAfterSeconds: number) =>
    fhirError(
      429,
      { severity: "error", code: "throttled", diagnostics: "Limite de pedidos excedido." },
      { "Retry-After": String(retryAfterSeconds) },
    ),
  conflict: (detail: string) => fhirError(409, { severity: "error", code: "conflict", diagnostics: detail }),
  server: () => fhirError(500, { severity: "fatal", code: "exception", diagnostics: "Erro interno ao processar o pedido." }),
};

export interface BundleOptions {
  total: number;
  baseUrl: string;
  resourceType: string;
  offset: number;
  count: number;
  query: URLSearchParams;
}

/** Bundle `searchset` com paginação por `_offset` / `_count`. */
export function searchBundle(entries: { fullUrl: string; resource: unknown }[], options: BundleOptions) {
  const link: { relation: string; url: string }[] = [];
  const buildUrl = (offset: number) => {
    const params = new URLSearchParams(options.query);
    params.set("_offset", String(offset));
    params.set("_count", String(options.count));
    return `${options.baseUrl}/${options.resourceType}?${params.toString()}`;
  };

  link.push({ relation: "self", url: buildUrl(options.offset) });
  if (options.offset + options.count < options.total) link.push({ relation: "next", url: buildUrl(options.offset + options.count) });
  if (options.offset > 0) link.push({ relation: "previous", url: buildUrl(Math.max(0, options.offset - options.count)) });

  return {
    resourceType: "Bundle" as const,
    type: "searchset" as const,
    total: options.total,
    link,
    entry: entries.map((e) => ({ fullUrl: e.fullUrl, resource: e.resource, search: { mode: "match" } })),
  };
}
