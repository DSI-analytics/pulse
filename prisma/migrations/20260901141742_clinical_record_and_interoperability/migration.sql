-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SOLTEIRO', 'CASADO', 'UNIAO_DE_FACTO', 'DIVORCIADO', 'VIUVO', 'OUTRO');

-- CreateEnum
CREATE TYPE "BloodType" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG', 'DESCONHECIDO');

-- CreateEnum
CREATE TYPE "IdentityDocumentType" AS ENUM ('BI', 'PASSAPORTE', 'DIRE', 'NUIT', 'CARTA_CONDUCAO', 'CEDULA', 'OUTRO');

-- CreateEnum
CREATE TYPE "EncounterType" AS ENUM ('CONSULTA', 'URGENCIA', 'ACOMPANHAMENTO', 'INTERNAMENTO', 'PROCEDIMENTO', 'EXAME', 'ENCAMINHAMENTO');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('PLANEADO', 'EM_CURSO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "VitalSignSource" AS ENUM ('CONSULTA', 'TRIAGEM', 'INTERNAMENTO', 'DOMICILIO');

-- CreateEnum
CREATE TYPE "DiagnosisKind" AS ENUM ('PRINCIPAL', 'SECUNDARIO', 'DIFERENCIAL');

-- CreateEnum
CREATE TYPE "DiagnosisCertainty" AS ENUM ('PROVISORIO', 'CONFIRMADO', 'REFUTADO');

-- CreateEnum
CREATE TYPE "AllergyCategory" AS ENUM ('MEDICAMENTO', 'ALIMENTO', 'AMBIENTAL', 'BIOLOGICO', 'OUTRO');

-- CreateEnum
CREATE TYPE "AllergyKind" AS ENUM ('ALERGIA', 'INTOLERANCIA');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('LEVE', 'MODERADA', 'GRAVE', 'FATAL');

-- CreateEnum
CREATE TYPE "AllergyStatus" AS ENUM ('ACTIVA', 'INACTIVA', 'RESOLVIDA', 'REFUTADA');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ACTIVA', 'CONCLUIDA', 'SUSPENSA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "MedicationRoute" AS ENUM ('ORAL', 'INTRAVENOSA', 'INTRAMUSCULAR', 'SUBCUTANEA', 'TOPICA', 'INALATORIA', 'RECTAL', 'OFTALMICA', 'OTOLOGICA', 'NASAL', 'OUTRA');

-- CreateEnum
CREATE TYPE "DiagnosticCategory" AS ENUM ('LABORATORIO', 'IMAGIOLOGIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "DiagnosticPriority" AS ENUM ('ROTINA', 'URGENTE', 'EMERGENTE');

-- CreateEnum
CREATE TYPE "DiagnosticOrderStatus" AS ENUM ('SOLICITADO', 'AGENDADO', 'RECOLHIDO', 'EM_PROCESSAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ProcedureStatus" AS ENUM ('PLANEADO', 'REALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TreatmentStatus" AS ENUM ('PLANEADO', 'EM_CURSO', 'CONCLUIDO', 'SUSPENSO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('ADMITIDO', 'ALTA', 'TRANSFERIDO', 'OBITO');

-- CreateEnum
CREATE TYPE "AttachmentCategory" AS ENUM ('EXAME', 'RECEITA', 'RELATORIO', 'CONSENTIMENTO', 'IDENTIFICACAO', 'IMAGEM', 'OUTRO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CONSULTA_PROXIMA';
ALTER TYPE "NotificationType" ADD VALUE 'RESULTADO_EXAME';
ALTER TYPE "NotificationType" ADD VALUE 'ALERTA_CLINICO';
ALTER TYPE "NotificationType" ADD VALUE 'TAREFA_PENDENTE';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "encounterId" TEXT;

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "assessment" TEXT,
ADD COLUMN     "chiefComplaint" TEXT,
ADD COLUMN     "encounterId" TEXT,
ADD COLUMN     "historyOfPresentIllness" TEXT,
ADD COLUMN     "physicalExam" TEXT,
ADD COLUMN     "referrals" TEXT,
ADD COLUMN     "symptoms" TEXT,
ADD COLUMN     "treatmentPlan" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "requiredPermission" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "addressReference" TEXT,
ADD COLUMN     "bloodType" "BloodType",
ADD COLUMN     "chronicConditions" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "clinicalSummary" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "district" TEXT,
ADD COLUMN     "emergencyContactPhoneAlt" TEXT,
ADD COLUMN     "emergencyContactRelation" TEXT,
ADD COLUMN     "familyHistory" TEXT,
ADD COLUMN     "genderIdentity" TEXT,
ADD COLUMN     "habits" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maritalStatus" "MaritalStatus",
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "neighbourhood" TEXT,
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "personalHistory" TEXT,
ADD COLUMN     "phoneAlt" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "preferredLanguage" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "streetNumber" TEXT,
ADD COLUMN     "surgicalHistory" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PatientIdentityDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "IdentityDocumentType" NOT NULL,
    "number" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedAt" DATE,
    "expiresAt" DATE,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientIdentityDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "specialtyId" TEXT,
    "number" TEXT NOT NULL,
    "type" "EncounterType" NOT NULL DEFAULT 'CONSULTA',
    "status" "EncounterStatus" NOT NULL DEFAULT 'EM_CURSO',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT,
    "summary" TEXT,
    "outcome" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalSign" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "consultationId" TEXT,
    "admissionId" TEXT,
    "source" "VitalSignSource" NOT NULL DEFAULT 'CONSULTA',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "temperature" DOUBLE PRECISION,
    "oxygenSaturation" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "glucose" DOUBLE PRECISION,
    "painScore" INTEGER,
    "extra" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VitalSign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "consultationId" TEXT,
    "kind" "DiagnosisKind" NOT NULL DEFAULT 'PRINCIPAL',
    "certainty" "DiagnosisCertainty" NOT NULL DEFAULT 'PROVISORIO',
    "code" TEXT,
    "codeSystem" TEXT,
    "description" TEXT NOT NULL,
    "onsetDate" DATE,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doctorId" TEXT,
    "recordedById" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergy" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "substanceKey" TEXT NOT NULL,
    "code" TEXT,
    "codeSystem" TEXT,
    "category" "AllergyCategory" NOT NULL DEFAULT 'MEDICAMENTO',
    "kind" "AllergyKind" NOT NULL DEFAULT 'ALERGIA',
    "reaction" TEXT,
    "severity" "AllergySeverity" NOT NULL DEFAULT 'MODERADA',
    "status" "AllergyStatus" NOT NULL DEFAULT 'ACTIVA',
    "identifiedAt" DATE,
    "doctorId" TEXT,
    "recordedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeIngredient" TEXT,
    "form" TEXT,
    "strength" TEXT,
    "code" TEXT,
    "codeSystem" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "consultationId" TEXT,
    "doctorId" TEXT,
    "number" TEXT NOT NULL,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVA',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATE,
    "notes" TEXT,
    "replacesId" TEXT,
    "cancelReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicationId" TEXT,
    "medicationName" TEXT NOT NULL,
    "activeIngredient" TEXT,
    "dose" TEXT,
    "doseUnit" TEXT,
    "route" "MedicationRoute",
    "frequency" TEXT,
    "durationDays" INTEGER,
    "quantity" TEXT,
    "instructions" TEXT,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVA',
    "allergyWarnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticOrder" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "consultationId" TEXT,
    "serviceId" TEXT,
    "number" TEXT NOT NULL,
    "category" "DiagnosticCategory" NOT NULL DEFAULT 'LABORATORIO',
    "name" TEXT NOT NULL,
    "code" TEXT,
    "codeSystem" TEXT,
    "priority" "DiagnosticPriority" NOT NULL DEFAULT 'ROTINA',
    "status" "DiagnosticOrderStatus" NOT NULL DEFAULT 'SOLICITADO',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "doctorId" TEXT,
    "requestedById" TEXT,
    "notes" TEXT,
    "cancelReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticResult" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "conclusion" TEXT,
    "notes" TEXT,
    "performedAt" TIMESTAMP(3),
    "performedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticResultItem" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "codeSystem" TEXT,
    "value" TEXT,
    "valueNumeric" DOUBLE PRECISION,
    "unit" TEXT,
    "referenceRange" TEXT,
    "isAbnormal" BOOLEAN NOT NULL DEFAULT false,
    "flag" TEXT,
    "notes" TEXT,

    CONSTRAINT "DiagnosticResultItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalProcedure" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "admissionId" TEXT,
    "serviceId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "codeSystem" TEXT,
    "status" "ProcedureStatus" NOT NULL DEFAULT 'REALIZADO',
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doctorId" TEXT,
    "description" TEXT,
    "outcome" TEXT,
    "complications" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Treatment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "name" TEXT NOT NULL,
    "plan" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "doctorId" TEXT,
    "status" "TreatmentStatus" NOT NULL DEFAULT 'EM_CURSO',
    "evolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Treatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "number" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "ward" TEXT,
    "room" TEXT,
    "bed" TEXT,
    "doctorId" TEXT,
    "diagnosis" TEXT,
    "evolution" TEXT,
    "dischargedAt" TIMESTAMP(3),
    "dischargeSummary" TEXT,
    "dischargeRecommendations" TEXT,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'ADMITIDO',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalAttachment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT,
    "encounterId" TEXT,
    "consultationId" TEXT,
    "diagnosticOrderId" TEXT,
    "admissionId" TEXT,
    "procedureId" TEXT,
    "prescriptionId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "AttachmentCategory" NOT NULL DEFAULT 'OUTRO',
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT,
    "authorName" TEXT,
    "documentDate" TIMESTAMP(3),
    "uploadedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FhirResource" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "fhirId" TEXT NOT NULL,
    "internalModel" TEXT NOT NULL,
    "internalId" TEXT NOT NULL,
    "versionId" INTEGER NOT NULL DEFAULT 1,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalIdentifiers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FhirResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiClient" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ipAddress" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientIdentityDocument_patientId_idx" ON "PatientIdentityDocument"("patientId");

-- CreateIndex
CREATE INDEX "PatientIdentityDocument_clinicId_number_idx" ON "PatientIdentityDocument"("clinicId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PatientIdentityDocument_clinicId_type_number_key" ON "PatientIdentityDocument"("clinicId", "type", "number");

-- CreateIndex
CREATE INDEX "Encounter_clinicId_patientId_startedAt_idx" ON "Encounter"("clinicId", "patientId", "startedAt");

-- CreateIndex
CREATE INDEX "Encounter_clinicId_status_idx" ON "Encounter"("clinicId", "status");

-- CreateIndex
CREATE INDEX "Encounter_clinicId_startedAt_idx" ON "Encounter"("clinicId", "startedAt");

-- CreateIndex
CREATE INDEX "Encounter_doctorId_idx" ON "Encounter"("doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_clinicId_number_key" ON "Encounter"("clinicId", "number");

-- CreateIndex
CREATE INDEX "VitalSign_clinicId_patientId_recordedAt_idx" ON "VitalSign"("clinicId", "patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "VitalSign_encounterId_idx" ON "VitalSign"("encounterId");

-- CreateIndex
CREATE INDEX "VitalSign_consultationId_idx" ON "VitalSign"("consultationId");

-- CreateIndex
CREATE INDEX "Diagnosis_clinicId_patientId_recordedAt_idx" ON "Diagnosis"("clinicId", "patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "Diagnosis_clinicId_code_idx" ON "Diagnosis"("clinicId", "code");

-- CreateIndex
CREATE INDEX "Diagnosis_encounterId_idx" ON "Diagnosis"("encounterId");

-- CreateIndex
CREATE INDEX "Allergy_clinicId_patientId_status_idx" ON "Allergy"("clinicId", "patientId", "status");

-- CreateIndex
CREATE INDEX "Allergy_clinicId_substanceKey_idx" ON "Allergy"("clinicId", "substanceKey");

-- CreateIndex
CREATE INDEX "Medication_clinicId_activeIngredient_idx" ON "Medication"("clinicId", "activeIngredient");

-- CreateIndex
CREATE UNIQUE INDEX "Medication_clinicId_name_key" ON "Medication"("clinicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_replacesId_key" ON "Prescription"("replacesId");

-- CreateIndex
CREATE INDEX "Prescription_clinicId_patientId_issuedAt_idx" ON "Prescription"("clinicId", "patientId", "issuedAt");

-- CreateIndex
CREATE INDEX "Prescription_clinicId_status_idx" ON "Prescription"("clinicId", "status");

-- CreateIndex
CREATE INDEX "Prescription_encounterId_idx" ON "Prescription"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_clinicId_number_key" ON "Prescription"("clinicId", "number");

-- CreateIndex
CREATE INDEX "PrescriptionItem_prescriptionId_idx" ON "PrescriptionItem"("prescriptionId");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_clinicId_patientId_requestedAt_idx" ON "DiagnosticOrder"("clinicId", "patientId", "requestedAt");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_clinicId_status_idx" ON "DiagnosticOrder"("clinicId", "status");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_encounterId_idx" ON "DiagnosticOrder"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticOrder_clinicId_number_key" ON "DiagnosticOrder"("clinicId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticResult_orderId_key" ON "DiagnosticResult"("orderId");

-- CreateIndex
CREATE INDEX "DiagnosticResult_clinicId_performedAt_idx" ON "DiagnosticResult"("clinicId", "performedAt");

-- CreateIndex
CREATE INDEX "DiagnosticResultItem_resultId_idx" ON "DiagnosticResultItem"("resultId");

-- CreateIndex
CREATE INDEX "ClinicalProcedure_clinicId_patientId_performedAt_idx" ON "ClinicalProcedure"("clinicId", "patientId", "performedAt");

-- CreateIndex
CREATE INDEX "ClinicalProcedure_encounterId_idx" ON "ClinicalProcedure"("encounterId");

-- CreateIndex
CREATE INDEX "Treatment_clinicId_patientId_startedAt_idx" ON "Treatment"("clinicId", "patientId", "startedAt");

-- CreateIndex
CREATE INDEX "Treatment_encounterId_idx" ON "Treatment"("encounterId");

-- CreateIndex
CREATE INDEX "Admission_clinicId_patientId_admittedAt_idx" ON "Admission"("clinicId", "patientId", "admittedAt");

-- CreateIndex
CREATE INDEX "Admission_clinicId_status_idx" ON "Admission"("clinicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_clinicId_number_key" ON "Admission"("clinicId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalAttachment_storageKey_key" ON "ClinicalAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "ClinicalAttachment_clinicId_patientId_createdAt_idx" ON "ClinicalAttachment"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalAttachment_encounterId_idx" ON "ClinicalAttachment"("encounterId");

-- CreateIndex
CREATE INDEX "ClinicalAttachment_diagnosticOrderId_idx" ON "ClinicalAttachment"("diagnosticOrderId");

-- CreateIndex
CREATE INDEX "FhirResource_clinicId_resourceType_idx" ON "FhirResource"("clinicId", "resourceType");

-- CreateIndex
CREATE INDEX "FhirResource_clinicId_lastUpdated_idx" ON "FhirResource"("clinicId", "lastUpdated");

-- CreateIndex
CREATE UNIQUE INDEX "FhirResource_resourceType_fhirId_key" ON "FhirResource"("resourceType", "fhirId");

-- CreateIndex
CREATE UNIQUE INDEX "FhirResource_internalModel_internalId_key" ON "FhirResource"("internalModel", "internalId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiClient_tokenHash_key" ON "ApiClient"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiClient_clinicId_isActive_idx" ON "ApiClient"("clinicId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ApiClient_clinicId_name_key" ON "ApiClient"("clinicId", "name");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ipAddress_createdAt_idx" ON "LoginAttempt"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "Consultation_clinicId_patientId_startedAt_idx" ON "Consultation"("clinicId", "patientId", "startedAt");

-- CreateIndex
CREATE INDEX "Consultation_encounterId_idx" ON "Consultation"("encounterId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Patient_clinicId_email_idx" ON "Patient"("clinicId", "email");

-- CreateIndex
CREATE INDEX "Patient_clinicId_birthDate_idx" ON "Patient"("clinicId", "birthDate");

-- CreateIndex
CREATE INDEX "Patient_clinicId_isActive_idx" ON "Patient"("clinicId", "isActive");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientIdentityDocument" ADD CONSTRAINT "PatientIdentityDocument_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientIdentityDocument" ADD CONSTRAINT "PatientIdentityDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticResult" ADD CONSTRAINT "DiagnosticResult_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticResult" ADD CONSTRAINT "DiagnosticResult_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DiagnosticOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticResult" ADD CONSTRAINT "DiagnosticResult_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticResultItem" ADD CONSTRAINT "DiagnosticResultItem_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "DiagnosticResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalProcedure" ADD CONSTRAINT "ClinicalProcedure_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalProcedure" ADD CONSTRAINT "ClinicalProcedure_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalProcedure" ADD CONSTRAINT "ClinicalProcedure_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalProcedure" ADD CONSTRAINT "ClinicalProcedure_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalProcedure" ADD CONSTRAINT "ClinicalProcedure_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalProcedure" ADD CONSTRAINT "ClinicalProcedure_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalProcedure" ADD CONSTRAINT "ClinicalProcedure_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_diagnosticOrderId_fkey" FOREIGN KEY ("diagnosticOrderId") REFERENCES "DiagnosticOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "ClinicalProcedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FhirResource" ADD CONSTRAINT "FhirResource_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiClient" ADD CONSTRAINT "ApiClient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
