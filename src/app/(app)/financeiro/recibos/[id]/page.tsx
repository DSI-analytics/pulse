import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFormatters, getTranslator } from "@/i18n/server";
import type { MessageKey } from "@/i18n/types";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("finance.receipt.pageTitle") };
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("finance.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const { id } = await params;
  const payment = await prisma.payment.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      clinic: { select: { name: true, nuit: true, phone: true, email: true, address: true, city: true } },
      patient: { select: { name: true, code: true } },
      invoice: { select: { number: true, total: true, items: { select: { id: true, description: true, quantity: true, total: true } } } },
    },
  });
  if (!payment || !payment.invoice) notFound();
  const receiptNumber = payment.receiptNumber ?? `REC-${payment.id.slice(-8).toUpperCase()}`;
  const methodKey = `finance.methods.${payment.method}` as MessageKey;
  const methodLabel = t(methodKey);

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-6 print:py-0">
      <div className="flex items-center justify-between print:hidden"><p className="text-sm text-muted-foreground">{t("finance.receipt.proof")}</p><PrintButton /></div>
      <Card>
        <CardHeader className="border-b border-border text-center">
          <CardTitle className="text-xl">{payment.clinic.name}</CardTitle>
          <p className="text-xs text-muted-foreground">{payment.clinic.address} · {payment.clinic.city}</p>
          <p className="text-xs text-muted-foreground">{t("finance.receipt.taxId", { nuit: payment.clinic.nuit ?? "—" })} · {payment.clinic.phone ?? payment.clinic.email ?? ""}</p>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="text-center"><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("finance.receipt.receipt")}</p><p className="font-mono text-lg font-semibold">{receiptNumber}</p></div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label={t("finance.receipt.invoice")} value={payment.invoice.number} /><Info label={t("finance.receipt.date")} value={f.dateMedium(payment.receivedAt)} />
            <Info label={t("finance.receipt.receivedFrom")} value={payment.fromInsurer ? t("finance.receipt.insurer") : payment.patient?.name ?? t("finance.receipt.patient")} />
            <Info label={t("finance.receipt.patient")} value={payment.patient ? `${payment.patient.name} · ${payment.patient.code}` : "—"} />
            <Info label={t("finance.receipt.method")} value={methodLabel === methodKey ? payment.method : methodLabel} /><Info label={t("finance.receipt.reference")} value={payment.reference ?? "—"} />
          </div>
          <div className="divide-y divide-border rounded-lg border border-border">
            {payment.invoice.items.map((item) => <div key={item.id} className="flex justify-between gap-4 p-3 text-sm"><span>{item.description} × {item.quantity}</span><span className="tabular">{f.moneyExact(item.total)}</span></div>)}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-primary-muted p-4"><span className="font-medium">{t("finance.receipt.amountReceived")}</span><span className="font-display text-xl font-semibold text-primary">{f.moneyExact(payment.amount)}</span></div>
          <p className="text-center text-xs text-muted-foreground">{t("finance.receipt.footer", { number: payment.invoice.number })}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>;
}
