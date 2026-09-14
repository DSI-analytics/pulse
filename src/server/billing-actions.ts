"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PaymentMethod } from "@prisma/client";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { reconcileBilling } from "@/lib/domain/billing";
import { parseMoneyInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { getFormatters, getTranslator } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";

const PAYMENT_METHODS = ["DINHEIRO", "MPESA", "EMOLA", "CARTAO", "TRANSFERENCIA", "SEGURADORA"] as const;

function paymentSchema(t: Translator) {
  return z.object({
    amount: z.string().trim().min(1, t("finance.payment.errors.amountRequired")),
    method: z.enum(PAYMENT_METHODS, { error: t("finance.payment.errors.methodRequired") }),
    reference: z.string().trim().max(120).optional().default(""),
    fromInsurer: z.boolean(),
  });
}

export type PaymentValues = z.input<ReturnType<typeof paymentSchema>>;
export type BillingActionResult = { ok: true; paymentId: string; receiptNumber: string } | { error: string };

class BillingError extends Error {}

export async function registerInvoicePayment(invoiceId: string, values: PaymentValues): Promise<BillingActionResult> {
  const user = await requireUser();
  const t = await getTranslator();
  if (!can(user.role, "finance.manage")) return { error: t("finance.payment.errors.noPermission") };
  const parsed = paymentSchema(t).safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const amount = parseMoneyInput(parsed.data.amount);
  if (amount === null) return { error: t("finance.payment.errors.invalidAmount") };
  if (amount <= 0) return { error: t("finance.payment.errors.amountPositive") };
  const f = await getFormatters();

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
      if (!invoice) throw new BillingError(t("finance.payment.errors.invoiceNotFound"));

      const patientPaid = invoice.payments.filter((payment) => !payment.fromInsurer).reduce((sum, payment) => sum + payment.amount, 0);
      const insurerPaid = invoice.payments.filter((payment) => payment.fromInsurer).reduce((sum, payment) => sum + payment.amount, 0);
      const before = reconcileBilling({ patientDue: invoice.patientDue, insurerDue: invoice.insurerDue, patientPaid, insurerPaid });
      const available = parsed.data.fromInsurer ? before.insurerOutstanding : before.patientOutstanding;
      if (parsed.data.fromInsurer && invoice.insurerDue === 0) throw new BillingError(t("finance.payment.errors.noInsurerBalance"));
      if (amount > available) throw new BillingError(t("finance.payment.errors.exceedsBalance", { amount: f.moneyExact(available) }));

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
    return { error: error instanceof BillingError ? error.message : t("finance.payment.errors.generic") };
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
