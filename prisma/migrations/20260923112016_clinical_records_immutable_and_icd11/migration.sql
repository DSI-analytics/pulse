-- CreateEnum
CREATE TYPE "ClinicalRecordType" AS ENUM ('ENCOUNTER', 'CONSULTATION', 'DIAGNOSIS', 'VITAL_SIGN', 'ALLERGY', 'PRESCRIPTION', 'DIAGNOSTIC_ORDER', 'DIAGNOSTIC_RESULT', 'PROCEDURE', 'TREATMENT', 'ADMISSION', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "ClinicalAddendumKind" AS ENUM ('ADENDA', 'CORRECCAO', 'ANULACAO', 'COMENTARIO');

-- AlterTable
ALTER TABLE "Diagnosis" ADD COLUMN     "codeRelease" TEXT,
ADD COLUMN     "codeUri" TEXT;

-- CreateTable
CREATE TABLE "ClinicalAddendum" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "targetType" "ClinicalRecordType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" "ClinicalAddendumKind" NOT NULL DEFAULT 'ADENDA',
    "body" TEXT NOT NULL,
    "replacementId" TEXT,
    "encounterId" TEXT,
    "doctorId" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcdCode" (
    "id" TEXT NOT NULL,
    "release" TEXT NOT NULL,
    "linearization" TEXT NOT NULL DEFAULT 'mms',
    "language" TEXT NOT NULL DEFAULT 'pt',
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "uri" TEXT,
    "chapter" TEXT,
    "searchText" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcdCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalAddendum_clinicId_targetType_targetId_idx" ON "ClinicalAddendum"("clinicId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "ClinicalAddendum_clinicId_patientId_createdAt_idx" ON "ClinicalAddendum"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalAddendum_encounterId_idx" ON "ClinicalAddendum"("encounterId");

-- CreateIndex
CREATE INDEX "IcdCode_searchText_idx" ON "IcdCode"("searchText");

-- CreateIndex
CREATE INDEX "IcdCode_code_idx" ON "IcdCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "IcdCode_release_linearization_language_code_key" ON "IcdCode"("release", "linearization", "language", "code");

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Registos clinicos permanentes (sec.36)
--
-- Um registo clinico nunca e apagado nem reescrito, nem pela aplicacao nem por
-- uma consulta directa: o PostgreSQL recusa. Para corrigir, esclarecer ou
-- anular, acrescenta-se uma adenda (ClinicalAddendum) - ela propria append-only
-- - e, se for caso disso, um registo novo.
--
-- Excepcao controlada: colunas de CICLO DE VIDA (estado, fecho, validacao),
-- permitidas so enquanto o registo esta aberto. Depois de concluido/validado/
-- alta, nem essas mudam.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pulso_clinical_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registo clinico permanente: DELETE nao e permitido em "%"', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Acrescente uma adenda (ClinicalAddendum) ou um registo novo.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pulso_clinical_frozen() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registo clinico imutavel: UPDATE nao e permitido em "%"', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Acrescente uma adenda (ClinicalAddendum) ou um registo novo.';
END;
$$ LANGUAGE plpgsql;

-- So deixa mudar as colunas de ciclo de vida passadas como argumento.
CREATE OR REPLACE FUNCTION pulso_clinical_lifecycle_only() RETURNS trigger AS $$
DECLARE
  allowed text[] := TG_ARGV[0]::text[];
  before_row jsonb := to_jsonb(OLD);
  after_row jsonb := to_jsonb(NEW);
  allowed_column text;
BEGIN
  FOREACH allowed_column IN ARRAY allowed LOOP
    before_row := before_row - allowed_column;
    after_row := after_row - allowed_column;
  END LOOP;
  IF before_row IS DISTINCT FROM after_row THEN
    RAISE EXCEPTION 'Registo clinico imutavel: em "%" so podem mudar as colunas de estado (%)', TG_TABLE_NAME, array_to_string(allowed, ', ')
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Acrescente uma adenda (ClinicalAddendum) ou um registo novo.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Nada de clinico e apagado.
DO $$
DECLARE clinical_table text;
BEGIN
  FOREACH clinical_table IN ARRAY ARRAY[
    'Encounter','Consultation','Diagnosis','VitalSign','Allergy','Prescription','PrescriptionItem',
    'DiagnosticOrder','DiagnosticResult','DiagnosticResultItem','ClinicalProcedure','Treatment',
    'Admission','ClinicalAttachment','ClinicalAddendum'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS clinical_no_delete ON %I', clinical_table);
    EXECUTE format('CREATE TRIGGER clinical_no_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION pulso_clinical_no_delete()', clinical_table);
  END LOOP;
END $$;

-- 2. Registos sem ciclo de vida: imutaveis desde a criacao.
DO $$
DECLARE clinical_table text;
BEGIN
  FOREACH clinical_table IN ARRAY ARRAY[
    'Diagnosis','VitalSign','ClinicalProcedure','PrescriptionItem','DiagnosticResultItem','ClinicalAddendum'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS clinical_frozen ON %I', clinical_table);
    EXECUTE format('CREATE TRIGGER clinical_frozen BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION pulso_clinical_frozen()', clinical_table);
  END LOOP;
END $$;

-- 3. Registos com ciclo de vida: so as colunas de estado, e so enquanto abertos.
DROP TRIGGER IF EXISTS clinical_closed ON "Encounter";
CREATE TRIGGER clinical_closed BEFORE UPDATE ON "Encounter" FOR EACH ROW
  WHEN (OLD."status"::text <> 'EM_CURSO') EXECUTE FUNCTION pulso_clinical_frozen();
DROP TRIGGER IF EXISTS clinical_lifecycle ON "Encounter";
CREATE TRIGGER clinical_lifecycle BEFORE UPDATE ON "Encounter" FOR EACH ROW
  EXECUTE FUNCTION pulso_clinical_lifecycle_only('{status,endedAt,summary,outcome,version,updatedAt}');

DROP TRIGGER IF EXISTS clinical_closed ON "Consultation";
CREATE TRIGGER clinical_closed BEFORE UPDATE ON "Consultation" FOR EACH ROW
  WHEN (OLD."endedAt" IS NOT NULL) EXECUTE FUNCTION pulso_clinical_frozen();
DROP TRIGGER IF EXISTS clinical_lifecycle ON "Consultation";
CREATE TRIGGER clinical_lifecycle BEFORE UPDATE ON "Consultation" FOR EACH ROW
  EXECUTE FUNCTION pulso_clinical_lifecycle_only('{endedAt,subjective,notes,diagnosis,prescription,recommendations,followUpDate,chiefComplaint,historyOfPresentIllness,symptoms,physicalExam,assessment,treatmentPlan,referrals,encounterId,version,updatedAt}');

DROP TRIGGER IF EXISTS clinical_lifecycle ON "Allergy";
CREATE TRIGGER clinical_lifecycle BEFORE UPDATE ON "Allergy" FOR EACH ROW
  EXECUTE FUNCTION pulso_clinical_lifecycle_only('{status,updatedAt}');

DROP TRIGGER IF EXISTS clinical_lifecycle ON "Prescription";
CREATE TRIGGER clinical_lifecycle BEFORE UPDATE ON "Prescription" FOR EACH ROW
  EXECUTE FUNCTION pulso_clinical_lifecycle_only('{status,cancelReason,replacesId,version,updatedAt}');

DROP TRIGGER IF EXISTS clinical_lifecycle ON "DiagnosticOrder";
CREATE TRIGGER clinical_lifecycle BEFORE UPDATE ON "DiagnosticOrder" FOR EACH ROW
  EXECUTE FUNCTION pulso_clinical_lifecycle_only('{status,scheduledAt,collectedAt,cancelReason,version,updatedAt}');

DROP TRIGGER IF EXISTS clinical_closed ON "DiagnosticResult";
CREATE TRIGGER clinical_closed BEFORE UPDATE ON "DiagnosticResult" FOR EACH ROW
  WHEN (OLD."validatedAt" IS NOT NULL) EXECUTE FUNCTION pulso_clinical_frozen();
DROP TRIGGER IF EXISTS clinical_lifecycle ON "DiagnosticResult";
CREATE TRIGGER clinical_lifecycle BEFORE UPDATE ON "DiagnosticResult" FOR EACH ROW
  EXECUTE FUNCTION pulso_clinical_lifecycle_only('{validatedAt,validatedById,updatedAt}');

DROP TRIGGER IF EXISTS clinical_closed ON "Treatment";
CREATE TRIGGER clinical_closed BEFORE UPDATE ON "Treatment" FOR EACH ROW
  WHEN (OLD."status"::text <> 'EM_CURSO') EXECUTE FUNCTION pulso_clinical_frozen();
DROP TRIGGER IF EXISTS clinical_lifecycle ON "Treatment";
CREATE TRIGGER clinical_lifecycle BEFORE UPDATE ON "Treatment" FOR EACH ROW
  EXECUTE FUNCTION pulso_clinical_lifecycle_only('{status,endedAt,evolution,updatedAt}');

DROP TRIGGER IF EXISTS clinical_closed ON "Admission";
CREATE TRIGGER clinical_closed BEFORE UPDATE ON "Admission" FOR EACH ROW
  WHEN (OLD."dischargedAt" IS NOT NULL) EXECUTE FUNCTION pulso_clinical_frozen();
DROP TRIGGER IF EXISTS clinical_lifecycle ON "Admission";
CREATE TRIGGER clinical_lifecycle BEFORE UPDATE ON "Admission" FOR EACH ROW
  EXECUTE FUNCTION pulso_clinical_lifecycle_only('{status,dischargedAt,dischargeSummary,dischargeRecommendations,evolution,diagnosis,version,updatedAt}');

DROP TRIGGER IF EXISTS clinical_lifecycle ON "ClinicalAttachment";
CREATE TRIGGER clinical_lifecycle BEFORE UPDATE ON "ClinicalAttachment" FOR EACH ROW
  EXECUTE FUNCTION pulso_clinical_lifecycle_only('{deletedAt,updatedAt}');
