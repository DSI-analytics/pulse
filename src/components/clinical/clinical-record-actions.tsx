import { CadastroButton } from "@/components/cadastro-form";
import { PrescriptionButton, type MedicationOption } from "@/components/clinical/prescription-form";
import {
  addAllergyForPatient,
  addDiagnosisForPatient,
  addProcedureForPatient,
  createDiagnosticOrderForPatient,
  recordVitalsForPatient,
} from "@/server/clinical-form-actions";
import { getTranslator } from "@/i18n/server";

/**
 * Barra de registo clínico do prontuário.
 *
 * Cada botão só é renderizado se o perfil tiver a permissão respectiva — mas
 * essa é a camada cosmética: a acção de servidor volta a verificar a permissão,
 * a clínica e o paciente antes de gravar seja o que for.
 *
 * O `patientId` é ligado no servidor com `.bind(null, id)`, pelo que não viaja
 * no formulário e não pode ser trocado no cliente.
 */
export async function ClinicalRecordActions({
  patientId,
  medications,
  permissions,
}: {
  patientId: string;
  medications: MedicationOption[];
  permissions: {
    vitals: boolean;
    allergy: boolean;
    diagnosis: boolean;
    prescription: boolean;
    laboratory: boolean;
  };
}) {
  const nothing = !Object.values(permissions).some(Boolean);
  if (nothing) return null;
  const t = await getTranslator();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {permissions.vitals && (
        <CadastroButton
          label={t("clinical.record.vitals.label")}
          title={t("clinical.record.vitals.title")}
          description={t("clinical.record.vitals.description")}
          variant="secondary"
          action={recordVitalsForPatient.bind(null, patientId)}
          fields={[
            { name: "systolic", label: t("clinical.vitals.labels.systolic"), type: "number", suffix: "mmHg" },
            { name: "diastolic", label: t("clinical.vitals.labels.diastolic"), type: "number", suffix: "mmHg" },
            { name: "heartRate", label: t("clinical.record.vitals.heartRate"), type: "number", suffix: "bpm" },
            { name: "respiratoryRate", label: t("clinical.record.vitals.respiratoryRate"), type: "number", suffix: "cpm" },
            { name: "temperature", label: t("clinical.vitals.labels.temperature"), type: "number", suffix: "°C" },
            { name: "oxygenSaturation", label: t("clinical.record.vitals.oxygenSaturation"), type: "number", suffix: "%" },
            { name: "weightKg", label: t("clinical.vitals.labels.weightKg"), type: "number", suffix: "kg" },
            { name: "heightCm", label: t("clinical.vitals.labels.heightCm"), type: "number", suffix: "cm" },
            { name: "glucose", label: t("clinical.vitals.labels.glucose"), type: "number", suffix: "mg/dL" },
            { name: "painScore", label: t("clinical.vitals.labels.painScore"), type: "number", suffix: "0–10" },
            {
              name: "source", label: t("clinical.record.vitals.context"), type: "select", defaultValue: "CONSULTA",
              options: (["CONSULTA", "TRIAGEM", "INTERNAMENTO", "DOMICILIO"] as const).map((value) => ({
                value,
                label: t(`clinical.record.vitals.sources.${value}`),
              })),
            },
            { name: "notes", label: t("clinical.record.vitals.notes"), full: true },
          ]}
        />
      )}

      {permissions.allergy && (
        <CadastroButton
          label={t("clinical.record.allergy.label")}
          title={t("clinical.record.allergy.title")}
          description={t("clinical.record.allergy.description")}
          variant="secondary"
          action={addAllergyForPatient.bind(null, patientId)}
          fields={[
            { name: "substance", label: t("clinical.record.allergy.substance"), required: true, full: true, placeholder: t("clinical.record.allergy.substancePlaceholder") },
            {
              name: "category", label: t("clinical.record.allergy.category"), type: "select", defaultValue: "MEDICAMENTO",
              options: (["MEDICAMENTO", "ALIMENTO", "AMBIENTAL", "BIOLOGICO", "OUTRO"] as const).map((value) => ({
                value,
                label: t(`clinical.record.allergy.categories.${value}`),
              })),
            },
            {
              name: "kind", label: t("clinical.record.allergy.kind"), type: "select", defaultValue: "ALERGIA",
              options: (["ALERGIA", "INTOLERANCIA"] as const).map((value) => ({
                value,
                label: t(`clinical.allergyKind.${value}`),
              })),
            },
            {
              name: "severity", label: t("clinical.record.allergy.severity"), type: "select", defaultValue: "MODERADA",
              options: (["LEVE", "MODERADA", "GRAVE", "FATAL"] as const).map((value) => ({
                value,
                label: t(`clinical.record.allergy.severities.${value}`),
              })),
            },
            { name: "identifiedAt", label: t("clinical.record.allergy.identifiedAt"), type: "date" },
            { name: "reaction", label: t("clinical.record.allergy.reaction"), full: true, placeholder: t("clinical.record.allergy.reactionPlaceholder") },
            { name: "notes", label: t("clinical.record.allergy.notes"), full: true },
          ]}
        />
      )}

      {permissions.diagnosis && (
        <CadastroButton
          label={t("clinical.record.diagnosis.label")}
          title={t("clinical.record.diagnosis.title")}
          description={t("clinical.record.diagnosis.description")}
          variant="secondary"
          action={addDiagnosisForPatient.bind(null, patientId)}
          fields={[
            { name: "description", label: t("clinical.record.diagnosis.descriptionField"), required: true, full: true, placeholder: t("clinical.record.diagnosis.descriptionPlaceholder") },
            { name: "code", label: t("clinical.record.diagnosis.code"), placeholder: t("clinical.record.diagnosis.codePlaceholder") },
            {
              name: "codeSystem", label: t("clinical.record.diagnosis.terminology"), type: "select", defaultValue: "ICD-10",
              options: [
                { value: "ICD-10", label: "ICD-10 / CID-10" },
                { value: "ICD-11", label: "ICD-11" },
                { value: "SNOMED-CT", label: "SNOMED CT" },
              ],
            },
            {
              name: "kind", label: t("clinical.record.diagnosis.kind"), type: "select", defaultValue: "PRINCIPAL",
              options: (["PRINCIPAL", "SECUNDARIO", "DIFERENCIAL"] as const).map((value) => ({
                value,
                label: t(`clinical.record.diagnosis.kinds.${value}`),
              })),
            },
            {
              name: "certainty", label: t("clinical.record.diagnosis.certainty"), type: "select", defaultValue: "PROVISORIO",
              options: (["PROVISORIO", "CONFIRMADO"] as const).map((value) => ({
                value,
                label: t(`clinical.record.diagnosis.certainties.${value}`),
              })),
            },
            { name: "onsetDate", label: t("clinical.record.diagnosis.onset"), type: "date" },
            { name: "notes", label: t("clinical.record.diagnosis.notes"), full: true },
          ]}
        />
      )}

      {permissions.prescription && <PrescriptionButton patientId={patientId} medications={medications} />}

      {permissions.laboratory && (
        <CadastroButton
          label={t("clinical.record.order.label")}
          title={t("clinical.record.order.title")}
          description={t("clinical.record.order.description")}
          variant="secondary"
          action={createDiagnosticOrderForPatient.bind(null, patientId)}
          fields={[
            { name: "name", label: t("clinical.record.order.name"), required: true, full: true, placeholder: t("clinical.record.order.namePlaceholder") },
            {
              name: "category", label: t("clinical.record.order.category"), type: "select", defaultValue: "LABORATORIO",
              options: (["LABORATORIO", "IMAGIOLOGIA", "OUTRO"] as const).map((value) => ({
                value,
                label: t(`clinical.record.order.categories.${value}`),
              })),
            },
            {
              name: "priority", label: t("clinical.record.order.priority"), type: "select", defaultValue: "ROTINA",
              options: (["ROTINA", "URGENTE", "EMERGENTE"] as const).map((value) => ({
                value,
                label: t(`clinical.record.order.priorities.${value}`),
              })),
            },
            { name: "code", label: t("clinical.record.order.code"), placeholder: t("clinical.record.order.codePlaceholder") },
            { name: "notes", label: t("clinical.record.order.notes"), full: true },
          ]}
        />
      )}

      {permissions.diagnosis && (
        <CadastroButton
          label={t("clinical.record.procedure.label")}
          title={t("clinical.record.procedure.title")}
          variant="secondary"
          action={addProcedureForPatient.bind(null, patientId)}
          fields={[
            { name: "name", label: t("clinical.record.procedure.name"), required: true, full: true },
            {
              name: "status", label: t("clinical.record.procedure.status"), type: "select", defaultValue: "REALIZADO",
              options: (["REALIZADO", "PLANEADO", "CANCELADO"] as const).map((value) => ({
                value,
                label: t(`clinical.record.procedure.statuses.${value}`),
              })),
            },
            { name: "performedAt", label: t("clinical.record.procedure.date"), type: "date" },
            { name: "description", label: t("clinical.record.procedure.descriptionField"), full: true },
            { name: "outcome", label: t("clinical.record.procedure.outcome"), full: true },
            { name: "complications", label: t("clinical.record.procedure.complications"), full: true },
          ]}
        />
      )}
    </div>
  );
}
