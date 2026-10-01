CREATE TYPE "PatientCopayMode" AS ENUM ('FIXED', 'PERCENTAGE');

ALTER TABLE "HealthPlan"
ADD COLUMN "patientCopayMode" "PatientCopayMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN "patientCopayPercentBps" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "HealthPlan"
ADD CONSTRAINT "HealthPlan_patientCopayPercentBps_check"
CHECK ("patientCopayPercentBps" >= 0 AND "patientCopayPercentBps" <= 10000);
