CREATE TABLE "DoctorNotificationPreference" (
    "userId" TEXT NOT NULL,
    "appointments" BOOLEAN NOT NULL DEFAULT true,
    "checkIns" BOOLEAN NOT NULL DEFAULT true,
    "cancellations" BOOLEAN NOT NULL DEFAULT true,
    "clinicalAlerts" BOOLEAN NOT NULL DEFAULT true,
    "examResults" BOOLEAN NOT NULL DEFAULT true,
    "reminders" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DoctorNotificationPreference_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "MobilePushDevice" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MobilePushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobilePushDevice_token_key" ON "MobilePushDevice"("token");
CREATE INDEX "MobilePushDevice_userId_isActive_idx" ON "MobilePushDevice"("userId", "isActive");
CREATE INDEX "MobilePushDevice_clinicId_idx" ON "MobilePushDevice"("clinicId");

ALTER TABLE "DoctorNotificationPreference"
ADD CONSTRAINT "DoctorNotificationPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MobilePushDevice"
ADD CONSTRAINT "MobilePushDevice_clinicId_fkey"
FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MobilePushDevice"
ADD CONSTRAINT "MobilePushDevice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
