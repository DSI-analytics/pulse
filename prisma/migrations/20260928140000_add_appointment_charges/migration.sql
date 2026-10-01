CREATE TABLE "AppointmentCharge" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentCharge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AppointmentCharge_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "AppointmentCharge_unitPrice_check" CHECK ("unitPrice" >= 0),
    CONSTRAINT "AppointmentCharge_total_check" CHECK ("total" >= 0)
);

CREATE UNIQUE INDEX "AppointmentCharge_appointmentId_serviceId_key" ON "AppointmentCharge"("appointmentId", "serviceId");
CREATE INDEX "AppointmentCharge_clinicId_appointmentId_idx" ON "AppointmentCharge"("clinicId", "appointmentId");
CREATE INDEX "AppointmentCharge_serviceId_idx" ON "AppointmentCharge"("serviceId");

ALTER TABLE "AppointmentCharge" ADD CONSTRAINT "AppointmentCharge_clinicId_fkey"
FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppointmentCharge" ADD CONSTRAINT "AppointmentCharge_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppointmentCharge" ADD CONSTRAINT "AppointmentCharge_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
