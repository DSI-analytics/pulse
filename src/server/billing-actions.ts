"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PaymentMethod } from "@prisma/client";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { reconcileBilling } from "@/lib/domain/billing";
import { parseMZN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

const PAYMENT_METHODS = ["DINHEIRO", "MPESA", "EMOLA", "CARTAO", "TRANSFERENCIA", "SEGURADORA"] as const;
const paymentSchema = z.object({
  amount: z.string().trim().min(1, "Indique o valor recebido."),
  method: z.enum(PAYMENT_METHODS, { error: "Selecione um método de pagamento." }),
  reference: z.string().trim().max(120).optional().default(""),
  fromInsurer: z.boolean(),
});

export type PaymentValues = z.input<typeof paymentSchema>;
export type BillingActionResult = { ok: true; paymentId: string; receiptNumber: string } | { error: string };

class BillingError extends Error {}

export async function registerInvoicePayment(invoiceId: string, values: PaymentValues): Promise<BillingActionResult> {
  const user = await requireUser();
  if (!can(user.role, "finance.manage")) return { error: "Sem permissão para registar pagamentos." };
  const parsed = paymentSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const amount = parseMZN(parsed.data.amount);
  if (amount <= 0) return { error: "O valor deve ser superior a zero." };

  const receiptNumber = `REC-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  let result: { paymentId: string; patientId: string; invoiceId: string };
  try {
    result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, clinicId: user.clinicId, status: { not: "ANULADA" } },
        select: {
          id: true, patientId: true, appointmentId: true, patientDue: true, insurerDue: true,
          payments: { select: { amount: true, fromInsurer: true, method: true } },
        },
      });
      if (!invoice) throw new BillingError("Fatura não encontrada ou anulada.");

      const patientPaid = invoice.payments.filter((payment) => !payment.fromInsurer).reduce((sum, payment) => sum + payment.amount, 0);
      const insurerPaid = invoice.payments.filter((payment) => payment.fromInsurer).reduce((sum, payment) => sum + payment.amount, 0);
      const before = reconcileBilling({ patientDue: invoice.patientDue, insurerDue: invoice.insurerDue, patientPaid, insurerPaid });
      const available = parsed.data.fromInsurer ? before.insurerOutstanding : before.patientOutstanding;
      if (parsed.data.fromInsurer && invoice.insurerDue === 0) throw new BillingError("Esta fatura não possui saldo atribuído à seguradora.");
      if (amount > available) throw new BillingError(`O valor excede o saldo disponível de ${(available / 100).toFixed(2)} MZN.`);

      const after = reconcileBilling({
        patientDue: invoice.patientDue,
        insurerDue: invoice.insurerDue,
        patientPaid: patientPaid + (parsed.data.fromInsurer ? 0 : amount),
        insurerPaid: insurerPaid + (parsed.data.fromInsurer ? amount : 0),
      });
      const methods = new Set<PaymentMethod>([...invoice.payments.map((payment) => payment.method), parsed.data.method]);
      const created = await tx.payment.create({
        data: {
          clinicId: user.clinicId,
          invoiceId: invoice.id,
          patientId: invoice.patientId,
          amount,
          method: parsed.data.method,
          reference: parsed.data.reference || null,
          receiptNumber,
          fromInsurer: parsed.data.fromInsurer,
        },
        select: { id: true },
      });
      await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: after.amountPaid, status: after.invoiceStatus } });
      if (invoice.appointmentId) {
        await tx.revenue.updateMany({
          where: { appointmentId: invoice.appointmentId, clinicId: user.clinicId },
          data: { status: after.revenueStatus, method: methods.size === 1 ? parsed.data.method : null },
        });
      }
      return { paymentId: created.id, patientId: invoice.patientId, invoiceId: invoice.id };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    return { error: error instanceof BillingError ? error.message : "Não foi possível registar o pagamento. Atualize a página e tente novamente." };
  }

  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    action: "invoice.payment",
    entity: "Payment",
    entityId: result.paymentId,
    metadata: { invoiceId: result.invoiceId, amount, fromInsurer: parsed.data.fromInsurer, receiptNumber },
  });
  revalidatePath("/financeiro");
  revalidatePath(`/financeiro/recibos/${result.paymentId}`);
  revalidatePath(`/pacientes/${result.patientId}`);
  revalidatePath("/");
  return { ok: true, paymentId: result.paymentId, receiptNumber };
}
