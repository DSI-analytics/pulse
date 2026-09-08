"use server";

import {
  addAllergy,
  addDiagnosis,
  addProcedure,
  createDiagnosticOrder,
  recordVitals,
  type ActionResult,
} from "@/server/clinical-actions";

/**
 * Adaptadores entre os formulários genéricos da UI (`CadastroButton`, que envia
 * `Record<string, string>`) e as acções tipadas do prontuário.
 *
 * O `patientId` é ligado no servidor com `.bind(null, id)` — não viaja no
 * formulário, pelo que não pode ser trocado no cliente. Toda a validação,
 * verificação de permissão e auditoria continuam a acontecer nas acções
 * originais.
 */

type Values = Record<string, string>;
type FormResult = { ok: true; id?: string } | { error: string };

function unwrap(result: ActionResult<{ id: string }> | ActionResult): FormResult {
  if ("error" in result) return { error: result.error };
  return { ok: true, id: "id" in result ? (result.id as string) : undefined };
}

export async function recordVitalsForPatient(patientId: string, values: Values): Promise<FormResult> {
  return unwrap(await recordVitals({ ...values, patientId }));
}

export async function addAllergyForPatient(patientId: string, values: Values): Promise<FormResult> {
  return unwrap(
    await addAllergy({
      patientId,
      substance: values.substance ?? "",
      category: (values.category || "MEDICAMENTO") as "MEDICAMENTO",
      kind: (values.kind || "ALERGIA") as "ALERGIA",
      reaction: values.reaction ?? "",
      severity: (values.severity || "MODERADA") as "MODERADA",
      status: "ACTIVA",
      identifiedAt: values.identifiedAt ?? "",
      notes: values.notes ?? "",
    }),
  );
}

export async function addDiagnosisForPatient(patientId: string, values: Values): Promise<FormResult> {
  return unwrap(
    await addDiagnosis({
      patientId,
      description: values.description ?? "",
      kind: (values.kind || "PRINCIPAL") as "PRINCIPAL",
      certainty: (values.certainty || "PROVISORIO") as "PROVISORIO",
      code: values.code ?? "",
      codeSystem: values.code ? (values.codeSystem || "ICD-10") : "",
      onsetDate: values.onsetDate ?? "",
      notes: values.notes ?? "",
      encounterId: values.encounterId ?? "",
      consultationId: values.consultationId ?? "",
    }),
  );
}

export async function createDiagnosticOrderForPatient(patientId: string, values: Values): Promise<FormResult> {
  return unwrap(
    await createDiagnosticOrder({
      patientId,
      name: values.name ?? "",
      category: (values.category || "LABORATORIO") as "LABORATORIO",
      priority: (values.priority || "ROTINA") as "ROTINA",
      code: values.code ?? "",
      codeSystem: values.code ? (values.codeSystem || "LOINC") : "",
      notes: values.notes ?? "",
      encounterId: values.encounterId ?? "",
      consultationId: values.consultationId ?? "",
    }),
  );
}

export async function addProcedureForPatient(patientId: string, values: Values): Promise<FormResult> {
  return unwrap(
    await addProcedure({
      patientId,
      name: values.name ?? "",
      status: (values.status || "REALIZADO") as "REALIZADO",
      performedAt: values.performedAt ?? "",
      description: values.description ?? "",
      outcome: values.outcome ?? "",
      complications: values.complications ?? "",
      notes: values.notes ?? "",
    }),
  );
}
