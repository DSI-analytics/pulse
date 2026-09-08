-- Backfill the financial cycle for consultations completed before automatic billing.
INSERT INTO "Invoice" (
  "id", "clinicId", "number", "patientId", "appointmentId", "healthPlanId",
  "status", "subtotal", "patientDue", "insurerDue", "total", "amountPaid",
  "issuedAt", "dueAt", "createdAt"
)
SELECT
  md5('invoice:' || a."id"),
  a."clinicId",
  'FAC-HIST-' || upper(substr(md5(a."id"), 1, 10)),
  a."patientId",
  a."id",
  a."healthPlanId",
  'EMITIDA'::"InvoiceStatus",
  a."priceQuoted",
  CASE
    WHEN a."healthPlanId" IS NULL THEN a."priceQuoted"
    ELSE least(a."priceQuoted", greatest(0, hp."patientCopay"))
  END,
  CASE
    WHEN a."healthPlanId" IS NULL THEN 0
    ELSE a."priceQuoted" - least(a."priceQuoted", greatest(0, hp."patientCopay"))
  END,
  a."priceQuoted",
  0,
  coalesce(c."endedAt", a."endAt"),
  coalesce(c."endedAt", a."endAt") + (coalesce(hic."paymentTermDays", 0) * interval '1 day'),
  now()
FROM "Appointment" a
LEFT JOIN "Consultation" c ON c."appointmentId" = a."id"
LEFT JOIN "HealthPlan" hp ON hp."id" = a."healthPlanId"
LEFT JOIN "HealthInsuranceCompany" hic ON hic."id" = hp."insuranceCompanyId"
WHERE a."status" = 'CONCLUIDA'::"AppointmentStatus"
  AND NOT EXISTS (SELECT 1 FROM "Invoice" i WHERE i."appointmentId" = a."id");

INSERT INTO "InvoiceItem" ("id", "invoiceId", "serviceId", "description", "quantity", "unitPrice", "total")
SELECT
  md5('invoice-item:' || a."id"),
  i."id",
  a."serviceId",
  coalesce(s."name", CASE a."type"
    WHEN 'RETORNO'::"AppointmentType" THEN 'Consulta de retorno'
    WHEN 'EXAME'::"AppointmentType" THEN 'Exame'
    WHEN 'PROCEDIMENTO'::"AppointmentType" THEN 'Procedimento'
    ELSE 'Consulta médica'
  END),
  1,
  a."priceQuoted",
  a."priceQuoted"
FROM "Appointment" a
JOIN "Invoice" i ON i."appointmentId" = a."id"
LEFT JOIN "Service" s ON s."id" = a."serviceId"
WHERE a."status" = 'CONCLUIDA'::"AppointmentStatus"
  AND NOT EXISTS (SELECT 1 FROM "InvoiceItem" ii WHERE ii."invoiceId" = i."id");

INSERT INTO "Revenue" (
  "id", "clinicId", "source", "description", "amount", "patientId", "doctorId",
  "specialtyId", "healthPlanId", "appointmentId", "status", "recognisedAt", "createdAt"
)
SELECT
  md5('revenue:' || a."id"),
  a."clinicId",
  coalesce(s."source", CASE WHEN a."healthPlanId" IS NULL THEN 'CONSULTA'::"RevenueSource" ELSE 'SEGURADORA'::"RevenueSource" END),
  coalesce(s."name", 'Consulta médica'),
  a."priceQuoted",
  a."patientId",
  a."doctorId",
  a."specialtyId",
  a."healthPlanId",
  a."id",
  'PENDENTE'::"PaymentStatus",
  coalesce(c."endedAt", a."endAt"),
  now()
FROM "Appointment" a
LEFT JOIN "Consultation" c ON c."appointmentId" = a."id"
LEFT JOIN "Service" s ON s."id" = a."serviceId"
WHERE a."status" = 'CONCLUIDA'::"AppointmentStatus"
  AND NOT EXISTS (SELECT 1 FROM "Revenue" r WHERE r."appointmentId" = a."id");
