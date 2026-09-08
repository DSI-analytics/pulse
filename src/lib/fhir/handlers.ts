import "server-only";
import type { NextRequest } from "next/server";
import { auditFhir, authenticateFhir, hasScope } from "./auth";
import { isSupportedResource, resolveFhirId, type FhirResourceType } from "./ids";
import { errors, fhirError, fhirJson, searchBundle, type OperationIssue } from "./outcome";
import { parseSearchParams, readResource, searchResources } from "./repository";
import {
  validateAllergyIntolerance,
  validateCondition,
  validateEnvelope,
  validateObservation,
  validatePatient,
} from "./validation";
import { isWritable, writeAllergy, writeCondition, writeObservation, writePatient, type WriteResult } from "./writers";

/**
 * Handlers partilhados pelas rotas `/fhir/[resourceType]` e
 * `/fhir/[resourceType]/[id]`.
 *
 * Sequência aplicada a todos os pedidos, sem excepção:
 *   autenticação → scope → validação → operação → auditoria.
 */

function baseUrls(request: NextRequest) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  return { origin, fhirBase: `${origin}/fhir`, url };
}

function resourceTypeOf(value: string): FhirResourceType | null {
  return isSupportedResource(value) ? value : null;
}

export async function handleSearch(request: NextRequest, rawResourceType: string): Promise<Response> {
  const resourceType = resourceTypeOf(rawResourceType);
  if (!resourceType) return errors.notFound(`Recurso "${rawResourceType}" não é suportado por este servidor.`);

  const auth = await authenticateFhir(request);
  if (!auth.ok) return auth.response;
  const { principal } = auth;
  const { origin, fhirBase, url } = baseUrls(request);

  if (!hasScope(principal, resourceType, "search")) {
    await auditFhir(principal, { resourceType, operation: "search", result: "NEGADO", endpoint: url.pathname, method: "GET" });
    return errors.forbidden(`Sem scope para pesquisar ${resourceType}.`);
  }

  const params = parseSearchParams(url);
  const { resources, total } = await searchResources(principal.clinicId, resourceType, params, origin);

  await auditFhir(principal, {
    resourceType,
    operation: "search",
    endpoint: url.pathname,
    method: "GET",
    metadata: { total, count: params.count, offset: params.offset, query: url.search.slice(0, 300) },
  });

  const bundle = searchBundle(
    resources.map((resource) => ({
      fullUrl: `${fhirBase}/${resourceType}/${(resource as { id: string }).id}`,
      resource,
    })),
    { total, baseUrl: fhirBase, resourceType, offset: params.offset, count: params.count, query: params.raw },
  );
  return fhirJson(bundle);
}

export async function handleRead(request: NextRequest, rawResourceType: string, id: string): Promise<Response> {
  const resourceType = resourceTypeOf(rawResourceType);
  if (!resourceType) return errors.notFound(`Recurso "${rawResourceType}" não é suportado por este servidor.`);

  const auth = await authenticateFhir(request);
  if (!auth.ok) return auth.response;
  const { principal } = auth;
  const { origin, url } = baseUrls(request);

  if (!hasScope(principal, resourceType, "read")) {
    await auditFhir(principal, { resourceType, operation: "read", entityId: id, result: "NEGADO", endpoint: url.pathname, method: "GET" });
    return errors.forbidden(`Sem scope para ler ${resourceType}.`);
  }

  const resource = await readResource(principal.clinicId, resourceType, id, origin);
  if (!resource) {
    await auditFhir(principal, { resourceType, operation: "read", entityId: id, result: "FALHA", endpoint: url.pathname, method: "GET" });
    return errors.notFound();
  }

  await auditFhir(principal, { resourceType, operation: "read", entityId: id, endpoint: url.pathname, method: "GET" });

  const meta = (resource as { meta?: { versionId?: string; lastUpdated?: string } }).meta;
  return fhirJson(resource, {
    headers: {
      ...(meta?.versionId ? { ETag: `W/"${meta.versionId}"` } : {}),
      ...(meta?.lastUpdated ? { "Last-Modified": new Date(meta.lastUpdated).toUTCString() } : {}),
    },
  });
}

async function applyWrite(
  clinicId: string,
  resourceType: FhirResourceType,
  body: Record<string, unknown>,
  existingInternalId: string | null,
): Promise<WriteResult | { ok: false; status: number; issues: OperationIssue[] }> {
  switch (resourceType) {
    case "Patient": {
      const parsed = validatePatient(body);
      if (!parsed.ok) return { ok: false, status: 400, issues: parsed.issues };
      return writePatient(clinicId, parsed.value, existingInternalId);
    }
    case "AllergyIntolerance": {
      const parsed = validateAllergyIntolerance(body);
      if (!parsed.ok) return { ok: false, status: 400, issues: parsed.issues };
      return writeAllergy(clinicId, parsed.value, existingInternalId);
    }
    case "Condition": {
      const parsed = validateCondition(body);
      if (!parsed.ok) return { ok: false, status: 400, issues: parsed.issues };
      return writeCondition(clinicId, parsed.value, existingInternalId);
    }
    case "Observation": {
      const parsed = validateObservation(body);
      if (!parsed.ok) return { ok: false, status: 400, issues: parsed.issues };
      return writeObservation(clinicId, parsed.value, existingInternalId);
    }
    default:
      return { ok: false, status: 405, issues: [{ severity: "error", code: "not-supported", diagnostics: `Escrita não suportada para ${resourceType}.` }] };
  }
}

export async function handleWrite(
  request: NextRequest,
  rawResourceType: string,
  id: string | null,
  method: "POST" | "PUT",
): Promise<Response> {
  const resourceType = resourceTypeOf(rawResourceType);
  if (!resourceType) return errors.notFound(`Recurso "${rawResourceType}" não é suportado por este servidor.`);

  const auth = await authenticateFhir(request);
  if (!auth.ok) return auth.response;
  const { principal } = auth;
  const { origin, fhirBase, url } = baseUrls(request);

  if (!hasScope(principal, resourceType, "write")) {
    await auditFhir(principal, { resourceType, operation: method === "POST" ? "create" : "update", entityId: id, result: "NEGADO", endpoint: url.pathname, method });
    return errors.forbidden(`Sem scope para escrever ${resourceType}.`);
  }
  if (!isWritable(resourceType)) {
    return errors.notSupported(
      `${resourceType} está disponível apenas para leitura nesta versão da API. Recursos com escrita: Patient, AllergyIntolerance, Condition, Observation.`,
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!/application\/(fhir\+)?json/i.test(contentType)) {
    return errors.invalid([{ severity: "error", code: "structure", diagnostics: "Content-Type tem de ser application/fhir+json." }]);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errors.invalid([{ severity: "error", code: "structure", diagnostics: "Corpo do pedido não é JSON válido." }]);
  }

  const envelope = validateEnvelope(body, resourceType);
  if (!envelope.ok) return errors.invalid(envelope.issues);

  let existingInternalId: string | null = null;
  if (id) {
    const resolved = await resolveFhirId(principal.clinicId, resourceType, id);
    if (!resolved) return errors.notFound();
    existingInternalId = resolved.internalId;
  }

  const result = await applyWrite(principal.clinicId, resourceType, envelope.value, existingInternalId);
  if (!result.ok) {
    await auditFhir(principal, {
      resourceType,
      operation: method === "POST" ? "create" : "update",
      entityId: id,
      result: "FALHA",
      endpoint: url.pathname,
      method,
      metadata: { issues: result.issues.map((i) => i.code) },
    });
    return fhirError(result.status, result.issues);
  }

  await auditFhir(principal, {
    resourceType,
    operation: result.created ? "create" : "update",
    entityId: result.fhirId,
    endpoint: url.pathname,
    method,
    metadata: { versionId: result.versionId },
  });

  const resource = await readResource(principal.clinicId, resourceType, result.fhirId, origin);
  return fhirJson(resource, {
    status: result.created ? 201 : 200,
    headers: {
      Location: `${fhirBase}/${resourceType}/${result.fhirId}`,
      ETag: `W/"${result.versionId}"`,
    },
  });
}
