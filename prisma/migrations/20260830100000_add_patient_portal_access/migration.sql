CREATE TABLE "PatientPortalAccess" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPortalAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientPortalAccess_patientId_key" ON "PatientPortalAccess"("patientId");
CREATE UNIQUE INDEX "PatientPortalAccess_tokenHash_key" ON "PatientPortalAccess"("tokenHash");
CREATE INDEX "PatientPortalAccess_clinicId_idx" ON "PatientPortalAccess"("clinicId");
CREATE INDEX "PatientPortalAccess_clinicId_isActive_idx" ON "PatientPortalAccess"("clinicId", "isActive");

ALTER TABLE "PatientPortalAccess" ADD CONSTRAINT "PatientPortalAccess_clinicId_fkey"
FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PatientPortalAccess" ADD CONSTRAINT "PatientPortalAccess_patientId_fkey"
FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
