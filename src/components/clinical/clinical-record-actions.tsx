import { CadastroButton } from "@/components/cadastro-form";
import { PrescriptionButton, type MedicationOption } from "@/components/clinical/prescription-form";
import {
  addAllergyForPatient,
  addDiagnosisForPatient,
  addProcedureForPatient,
  createDiagnosticOrderForPatient,
  recordVitalsForPatient,
} from "@/server/clinical-form-actions";

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
export function ClinicalRecordActions({
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {permissions.vitals && (
        <CadastroButton
          label="Sinais vitais"
          title="Registar sinais vitais"
          description="Deixe em branco o que não foi medido. O IMC é calculado automaticamente."
          variant="secondary"
          action={recordVitalsForPatient.bind(null, patientId)}
          fields={[
            { name: "systolic", label: "Pressão sistólica", type: "number", suffix: "mmHg" },
            { name: "diastolic", label: "Pressão diastólica", type: "number", suffix: "mmHg" },
            { name: "heartRate", label: "Freq. cardíaca", type: "number", suffix: "bpm" },
            { name: "respiratoryRate", label: "Freq. respiratória", type: "number", suffix: "cpm" },
            { name: "temperature", label: "Temperatura", type: "number", suffix: "°C" },
            { name: "oxygenSaturation", label: "Saturação O₂", type: "number", suffix: "%" },
            { name: "weightKg", label: "Peso", type: "number", suffix: "kg" },
            { name: "heightCm", label: "Altura", type: "number", suffix: "cm" },
            { name: "glucose", label: "Glicemia", type: "number", suffix: "mg/dL" },
            { name: "painScore", label: "Dor", type: "number", suffix: "0–10" },
            {
              name: "source", label: "Contexto", type: "select", defaultValue: "CONSULTA",
              options: [
                { value: "CONSULTA", label: "Consulta" },
                { value: "TRIAGEM", label: "Triagem" },
                { value: "INTERNAMENTO", label: "Internamento" },
                { value: "DOMICILIO", label: "Domicílio" },
              ],
            },
            { name: "notes", label: "Notas", full: true },
          ]}
        />
      )}

      {permissions.allergy && (
        <CadastroButton
          label="Alergia"
          title="Registar alergia ou intolerância"
          description="Fica destacada no topo do prontuário e é verificada em cada prescrição."
          variant="secondary"
          action={addAllergyForPatient.bind(null, patientId)}
          fields={[
            { name: "substance", label: "Substância", required: true, full: true, placeholder: "Ex.: Penicilina" },
            {
              name: "category", label: "Categoria", type: "select", defaultValue: "MEDICAMENTO",
              options: [
                { value: "MEDICAMENTO", label: "Medicamento" },
                { value: "ALIMENTO", label: "Alimento" },
                { value: "AMBIENTAL", label: "Ambiental" },
                { value: "BIOLOGICO", label: "Biológico" },
                { value: "OUTRO", label: "Outro" },
              ],
            },
            {
              name: "kind", label: "Tipo", type: "select", defaultValue: "ALERGIA",
              options: [
                { value: "ALERGIA", label: "Alergia" },
                { value: "INTOLERANCIA", label: "Intolerância" },
              ],
            },
            {
              name: "severity", label: "Gravidade", type: "select", defaultValue: "MODERADA",
              options: [
                { value: "LEVE", label: "Leve" },
                { value: "MODERADA", label: "Moderada" },
                { value: "GRAVE", label: "Grave" },
                { value: "FATAL", label: "Fatal" },
              ],
            },
            { name: "identifiedAt", label: "Identificada em", type: "date" },
            { name: "reaction", label: "Reacção", full: true, placeholder: "Ex.: Urticária generalizada" },
            { name: "notes", label: "Observações", full: true },
          ]}
        />
      )}

      {permissions.diagnosis && (
        <CadastroButton
          label="Diagnóstico"
          title="Registar diagnóstico"
          description="O código é opcional; quando indicado, assume-se ICD-10 salvo indicação contrária."
          variant="secondary"
          action={addDiagnosisForPatient.bind(null, patientId)}
          fields={[
            { name: "description", label: "Descrição", required: true, full: true, placeholder: "Ex.: Hipertensão essencial" },
            { name: "code", label: "Código", placeholder: "Ex.: I10" },
            {
              name: "codeSystem", label: "Terminologia", type: "select", defaultValue: "ICD-10",
              options: [
                { value: "ICD-10", label: "ICD-10 / CID-10" },
                { value: "ICD-11", label: "ICD-11" },
                { value: "SNOMED-CT", label: "SNOMED CT" },
              ],
            },
            {
              name: "kind", label: "Tipo", type: "select", defaultValue: "PRINCIPAL",
              options: [
                { value: "PRINCIPAL", label: "Principal" },
                { value: "SECUNDARIO", label: "Secundário" },
                { value: "DIFERENCIAL", label: "Diferencial" },
              ],
            },
            {
              name: "certainty", label: "Certeza", type: "select", defaultValue: "PROVISORIO",
              options: [
                { value: "PROVISORIO", label: "Provisório" },
                { value: "CONFIRMADO", label: "Confirmado" },
              ],
            },
            { name: "onsetDate", label: "Início", type: "date" },
            { name: "notes", label: "Observações", full: true },
          ]}
        />
      )}

      {permissions.prescription && <PrescriptionButton patientId={patientId} medications={medications} />}

      {permissions.laboratory && (
        <CadastroButton
          label="Pedido de exame"
          title="Solicitar exame"
          description="O resultado fica ligado a este pedido e entra na linha temporal do paciente."
          variant="secondary"
          action={createDiagnosticOrderForPatient.bind(null, patientId)}
          fields={[
            { name: "name", label: "Exame", required: true, full: true, placeholder: "Ex.: Hemograma completo" },
            {
              name: "category", label: "Categoria", type: "select", defaultValue: "LABORATORIO",
              options: [
                { value: "LABORATORIO", label: "Laboratório" },
                { value: "IMAGIOLOGIA", label: "Imagiologia" },
                { value: "OUTRO", label: "Outro" },
              ],
            },
            {
              name: "priority", label: "Prioridade", type: "select", defaultValue: "ROTINA",
              options: [
                { value: "ROTINA", label: "Rotina" },
                { value: "URGENTE", label: "Urgente" },
                { value: "EMERGENTE", label: "Emergente" },
              ],
            },
            { name: "code", label: "Código", placeholder: "Ex.: 58410-2 (LOINC)" },
            { name: "notes", label: "Observações", full: true },
          ]}
        />
      )}

      {permissions.diagnosis && (
        <CadastroButton
          label="Procedimento"
          title="Registar procedimento"
          variant="secondary"
          action={addProcedureForPatient.bind(null, patientId)}
          fields={[
            { name: "name", label: "Procedimento", required: true, full: true },
            {
              name: "status", label: "Estado", type: "select", defaultValue: "REALIZADO",
              options: [
                { value: "REALIZADO", label: "Realizado" },
                { value: "PLANEADO", label: "Planeado" },
                { value: "CANCELADO", label: "Cancelado" },
              ],
            },
            { name: "performedAt", label: "Data", type: "date" },
            { name: "description", label: "Descrição", full: true },
            { name: "outcome", label: "Resultado", full: true },
            { name: "complications", label: "Complicações", full: true },
          ]}
        />
      )}
    </div>
  );
}
