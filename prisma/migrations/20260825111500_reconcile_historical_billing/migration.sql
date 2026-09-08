-- Rebuild stored invoice/revenue state from the payment ledger.
WITH payment_totals AS (
  SELECT
    p."invoiceId",
    coalesce(sum(p."amount"), 0)::integer AS paid
  FROM "Payment" p
  WHERE p."invoiceId" IS NOT NULL
  GROUP BY p."invoiceId"
)
UPDATE "Invoice" i
SET
  "amountPaid" = coalesce(pt.paid, 0),
  "status" = CASE
    WHEN coalesce(pt.paid, 0) >= i."total" AND i."total" > 0 THEN 'PAGA'::"InvoiceStatus"
    WHEN coalesce(pt.paid, 0) > 0 THEN 'PARCIAL'::"InvoiceStatus"
    ELSE 'EMITIDA'::"InvoiceStatus"
  END
FROM payment_totals pt
WHERE pt."invoiceId" = i."id"
  AND i."status" <> 'ANULADA'::"InvoiceStatus";

UPDATE "Invoice" i
SET "amountPaid" = 0, "status" = 'EMITIDA'::"InvoiceStatus"
WHERE i."status" <> 'ANULADA'::"InvoiceStatus"
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."invoiceId" = i."id");

WITH payment_summary AS (
  SELECT
    p."invoiceId",
    sum(p."amount")::integer AS paid,
    count(DISTINCT p."method") AS method_count,
    min(p."method"::text) AS single_method
  FROM "Payment" p
  WHERE p."invoiceId" IS NOT NULL
  GROUP BY p."invoiceId"
)
UPDATE "Revenue" r
SET
  "status" = CASE
    WHEN coalesce(ps.paid, 0) >= i."total" AND i."total" > 0 THEN 'PAGO'::"PaymentStatus"
    WHEN coalesce(ps.paid, 0) > 0 THEN 'PARCIAL'::"PaymentStatus"
    ELSE 'PENDENTE'::"PaymentStatus"
  END,
  "method" = CASE WHEN ps.method_count = 1 THEN ps.single_method::"PaymentMethod" ELSE NULL END
FROM "Invoice" i
LEFT JOIN payment_summary ps ON ps."invoiceId" = i."id"
WHERE r."appointmentId" = i."appointmentId";
