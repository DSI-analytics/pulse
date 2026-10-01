import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ReceiptText } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reconcileBilling } from "@/lib/domain/billing";
import { PrintButton } from "@/components/print-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFormatters, getTranslator } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("finance.invoiceDocument.pageTitle") };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("finance.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      clinic: { select: { name: true, nuit: true, phone: true, email: true, address: true, city: true } },
      patient: { select: { name: true, code: true, phone: true } },
      healthPlan: { select: { name: true, insuranceCompany: { select: { name: true } } } },
      items: { orderBy: { id: "asc" }, select: { id: true, description: true, quantity: true, unitPrice: true, total: true } },
      payments: { orderBy: { receivedAt: "asc" }, select: { id: true, amount: true, fromInsurer: true, receiptNumber: true, receivedAt: true } },
    },
  });
  if (!invoice) notFound();

  const patientPaid = invoice.payments.filter((payment) => !payment.fromInsurer).reduce((sum, payment) => sum + payment.amount, 0);
  const insurerPaid = invoice.payments.filter((payment) => payment.fromInsurer).reduce((sum, payment) => sum + payment.amount, 0);
  const billing = reconcileBilling({ patientDue: invoice.patientDue, insurerDue: invoice.insurerDue, patientPaid, insurerPaid });
  const effectiveStatus = invoice.status === "ANULADA" ? invoice.status : billing.invoiceStatus;
  const statusLabel = t(`finance.invoiceStatus.${effectiveStatus}`);
  const statusVariant = effectiveStatus === "PAGA" ? "success" : effectiveStatus === "PARCIAL" ? "warning" : effectiveStatus === "ANULADA" ? "neutral" : "info";

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6 antialiased print:max-w-none print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground"><FileText className="size-4 text-primary" />{t("finance.invoiceDocument.documentDescription")}</p>
        <PrintButton />
      </div>

      <Card className="print:rounded-none print:border-0 print:shadow-none">
        <CardHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-6">
            <div>
              <CardTitle className="text-xl">{invoice.clinic.name}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{[invoice.clinic.address, invoice.clinic.city].filter(Boolean).join(" · ")}</p>
              <p className="text-xs text-muted-foreground">{t("finance.invoiceDocument.taxId", { nuit: invoice.clinic.nuit ?? "—" })} · {invoice.clinic.phone ?? invoice.clinic.email ?? ""}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("finance.invoiceDocument.document")}</p>
              <p className="mt-1 font-mono text-lg font-semibold text-foreground">{invoice.number}</p>
              <Badge className="mt-2" variant={statusVariant}>{statusLabel}</Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-5">
          <div className="grid gap-4 border-b border-border pb-5 text-sm sm:grid-cols-2">
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("finance.invoiceDocument.patient")}</p>
              <p className="mt-1 font-semibold text-foreground">{invoice.patient.name}</p>
              <p className="text-xs text-muted-foreground">{t("finance.invoiceDocument.patientCode")}: {invoice.patient.code}</p>
              {invoice.patient.phone && <p className="text-xs text-muted-foreground">{invoice.patient.phone}</p>}
              {invoice.healthPlan && <p className="mt-2 text-xs font-medium text-info">{t("finance.invoiceDocument.insurer")}: {invoice.healthPlan.insuranceCompany.name} · {t("finance.invoiceDocument.plan")}: {invoice.healthPlan.name}</p>}
            </section>
            <section className="grid grid-cols-2 gap-3 sm:text-right">
              <Info label={t("finance.invoiceDocument.issuedAt")} value={f.dateMedium(invoice.issuedAt)} />
              <Info label={t("finance.invoiceDocument.dueAt")} value={invoice.dueAt ? f.dateMedium(invoice.dueAt) : t("finance.invoiceDocument.noDueDate")} />
            </section>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <div className="min-w-[600px]">
              <div className="grid grid-cols-[1fr_52px_125px_125px] gap-3 border-b border-border bg-surface-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{t("finance.invoiceDocument.description")}</span><span className="text-right">{t("finance.invoiceDocument.quantity")}</span><span className="text-right">{t("finance.invoiceDocument.unitPrice")}</span><span className="text-right">{t("finance.invoiceDocument.itemTotal")}</span>
              </div>
              {invoice.items.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_52px_125px_125px] gap-3 border-b border-border px-3 py-3 text-sm last:border-b-0">
                  <span className="font-medium text-foreground">{item.description}</span><span className="text-right tabular">{item.quantity}</span><span className="text-right tabular">{f.moneyExact(item.unitPrice)}</span><span className="text-right font-medium tabular">{f.moneyExact(item.total)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ml-auto w-full max-w-sm space-y-2 text-sm">
            <TotalLine label={t("finance.invoiceDocument.subtotal")} value={f.moneyExact(invoice.subtotal)} />
            <TotalLine label={t("finance.invoiceDocument.patientDue")} value={f.moneyExact(invoice.patientDue)} />
            {invoice.insurerDue > 0 && <TotalLine label={t("finance.invoiceDocument.insurerDue")} value={f.moneyExact(invoice.insurerDue)} />}
            <TotalLine label={t("finance.invoiceDocument.paid")} value={f.moneyExact(billing.amountPaid)} />
            <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold text-foreground"><span>{t("finance.invoiceDocument.total")}</span><span className="tabular">{f.moneyExact(invoice.total)}</span></div>
            <div className="flex items-center justify-between rounded-lg border border-primary-edge bg-primary-muted px-3 py-2 font-semibold text-primary"><span>{t("finance.invoiceDocument.outstanding")}</span><span className="tabular">{f.moneyExact(billing.outstanding)}</span></div>
          </div>

          <section className="print:hidden">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("finance.invoiceDocument.paymentHistory")}</p>
            {invoice.payments.length ? (
              <div className="divide-y divide-border rounded-lg border border-border">
                {invoice.payments.map((payment) => (
                  <Link key={payment.id} href={`/financeiro/recibos/${payment.id}`} className="flex items-center justify-between gap-4 px-3 py-2 text-sm hover:bg-surface-2">
                    <span className="inline-flex items-center gap-2 font-medium text-foreground"><ReceiptText className="size-4 text-primary" />{t("finance.invoiceDocument.receipt", { number: payment.receiptNumber ?? payment.id.slice(-8).toUpperCase() })}</span>
                    <span className="text-right"><span className="block font-semibold tabular">{f.moneyExact(payment.amount)}</span><span className="text-xs text-muted-foreground">{payment.fromInsurer ? t("finance.invoiceDocument.paidByInsurer") : t("finance.invoiceDocument.paidByPatient")} · {f.date(payment.receivedAt)}</span></span>
                  </Link>
                ))}
              </div>
            ) : <p className="rounded-lg border border-border px-3 py-3 text-sm text-muted-foreground">{t("finance.invoiceDocument.noPayments")}</p>}
          </section>

          <p className="border-t border-border pt-4 text-center text-xs text-muted-foreground">{t("finance.invoiceDocument.footer", { clinic: invoice.clinic.name })}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium text-foreground">{value}</p></div>;
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular text-foreground">{value}</span></div>;
}
