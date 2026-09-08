-- Human-readable receipt identifier for traceable payments.
ALTER TABLE "Payment" ADD COLUMN "receiptNumber" TEXT;

CREATE UNIQUE INDEX "Payment_clinicId_receiptNumber_key"
ON "Payment"("clinicId", "receiptNumber");
