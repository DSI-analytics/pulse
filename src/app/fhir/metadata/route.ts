import type { NextRequest } from "next/server";
import { authenticateFhir } from "@/lib/fhir/auth";
import { SUPPORTED_RESOURCES } from "@/lib/fhir/ids";
import { fhirJson } from "@/lib/fhir/outcome";
import { isWritable } from "@/lib/fhir/writers";

/**
 * CapabilityStatement do servidor FHIR (`GET /fhir/metadata`).
 *
 * Declara exactamente o que está implementado — nem mais, nem menos: recursos
 * expostos, interacções suportadas por recurso e parâmetros de pesquisa
 * reconhecidos. Continua a exigir autenticação: a lista de capacidades não é
 * pública.
 */

const SEARCH_PARAMS: Record<string, string[]> = {
  Patient: ["_count", "_offset", "identifier", "name", "family", "birthdate", "active"],
  Practitioner: ["_count", "_offset", "name"],
  Organization: ["_count", "_offset"],
  Encounter: ["_count", "_offset", "patient", "status", "date"],
  Appointment: ["_count", "_offset", "patient", "date"],
  Observation: ["_count", "_offset", "patient", "date"],
  Condition: ["_count", "_offset", "patient", "clinical-status", "code"],
  AllergyIntolerance: ["_count", "_offset", "patient"],
  Medication: ["_count", "_offset", "code"],
  MedicationRequest: ["_count", "_offset", "patient", "status"],
  DiagnosticReport: ["_count", "_offset", "patient", "date"],
  Procedure: ["_count", "_offset", "patient", "date"],
  DocumentReference: ["_count", "_offset", "patient"],
};

export async function GET(request: NextRequest) {
  const auth = await authenticateFhir(request);
  if (!auth.ok) return auth.response;

  const base = new URL(request.url);
  const url = `${base.protocol}//${base.host}/fhir`;

  return fhirJson({
    resourceType: "CapabilityStatement",
    status: "active",
    date: new Date().toISOString(),
    publisher: "Pulso",
    kind: "instance",
    implementation: { description: "Pulso — camada de interoperabilidade HL7 FHIR", url },
    fhirVersion: "4.0.1",
    format: ["application/fhir+json"],
    rest: [
      {
        mode: "server",
        security: {
          cors: false,
          service: [
            {
              coding: [{ system: "http://terminology.hl7.org/CodeSystem/restful-security-service", code: "OAuth", display: "OAuth" }],
              text: "Bearer token de ApiClient ou sessão autenticada da aplicação. Scopes no formato SMART on FHIR (system/<Resource>.<read|write>).",
            },
          ],
        },
        resource: SUPPORTED_RESOURCES.map((resourceType) => ({
          type: resourceType,
          interaction: [
            { code: "read" },
            { code: "search-type" },
            ...(isWritable(resourceType) ? [{ code: "create" }, { code: "update" }] : []),
          ],
          searchParam: (SEARCH_PARAMS[resourceType] ?? []).map((name) => ({ name, type: "string" })),
        })),
      },
    ],
  });
}
