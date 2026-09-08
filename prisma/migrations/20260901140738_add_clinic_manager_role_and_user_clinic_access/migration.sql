-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'CLINIC_MANAGER';
ALTER TYPE "UserRole" ADD VALUE 'NURSE';
ALTER TYPE "UserRole" ADD VALUE 'LAB_TECHNICIAN';
ALTER TYPE "UserRole" ADD VALUE 'PHARMACIST';

-- CreateTable
CREATE TABLE "UserClinicAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserClinicAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserClinicAccess_clinicId_idx" ON "UserClinicAccess"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "UserClinicAccess_userId_clinicId_key" ON "UserClinicAccess"("userId", "clinicId");

-- AddForeignKey
ALTER TABLE "UserClinicAccess" ADD CONSTRAINT "UserClinicAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClinicAccess" ADD CONSTRAINT "UserClinicAccess_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
