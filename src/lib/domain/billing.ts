import type { InvoiceStatus, PaymentStatus } from "@prisma/client";

export interface BillingSplit {
  patientDue: number;
  insurerDue: number;
}

export interface BillingReconciliation {
  patientPaid: number;
  insurerPaid: number;
  amountPaid: number;
  patientOutstanding: number;
  insurerOutstanding: number;
  outstanding: number;
  invoiceStatus: InvoiceStatus;
  revenueStatus: PaymentStatus;
}

export function splitInvoice(total: number, insured: boolean, copay: number): BillingSplit {
  const safeTotal = Math.max(0, Math.round(total));
  if (!insured) return { patientDue: safeTotal, insurerDue: 0 };
  const patientDue = Math.min(safeTotal, Math.max(0, Math.round(copay)));
  return { patientDue, insurerDue: safeTotal - patientDue };
}

export function reconcileBilling(input: {
  patientDue: number;
  insurerDue: number;
  patientPaid: number;
  insurerPaid: number;
}): BillingReconciliation {
  const patientDue = Math.max(0, Math.round(input.patientDue));
  const insurerDue = Math.max(0, Math.round(input.insurerDue));
  const patientPaid = Math.max(0, Math.round(input.patientPaid));
  const insurerPaid = Math.max(0, Math.round(input.insurerPaid));
  const amountPaid = patientPaid + insurerPaid;
  const patientOutstanding = Math.max(0, patientDue - patientPaid);
  const insurerOutstanding = Math.max(0, insurerDue - insurerPaid);
  const outstanding = patientOutstanding + insurerOutstanding;
  const total = patientDue + insurerDue;
  const invoiceStatus: InvoiceStatus = outstanding === 0 && total > 0 ? "PAGA" : amountPaid > 0 ? "PARCIAL" : "EMITIDA";
  const revenueStatus: PaymentStatus = outstanding === 0 && total > 0 ? "PAGO" : amountPaid > 0 ? "PARCIAL" : "PENDENTE";

  return { patientPaid, insurerPaid, amountPaid, patientOutstanding, insurerOutstanding, outstanding, invoiceStatus, revenueStatus };
}
