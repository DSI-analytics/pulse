import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDatePt } from "@/lib/datetime";
import { formatMZNExact } from "@/lib/money";
import { PrintButton } from "@/components/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const METHOD_LABEL: Record<string, string> = { DINHEIRO: "Dinheiro", MPESA: "M-Pesa", EMOLA: "e-Mola", CARTAO: "Cartão", TRANSFERENCIA: "Transferência", SEGURADORA: "Seguradora" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("finance.view");
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

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-6 print:py-0">
      <div className="flex items-center justify-between print:hidden"><p className="text-sm text-muted-foreground">Comprovativo de pagamento</p><PrintButton /></div>
      <Card>
        <CardHeader className="border-b border-border text-center">
          <CardTitle className="text-xl">{payment.clinic.name}</CardTitle>
          <p className="text-xs text-muted-foreground">{payment.clinic.address} · {payment.clinic.city}</p>
          <p className="text-xs text-muted-foreground">NUIT {payment.clinic.nuit ?? "—"} · {payment.clinic.phone ?? payment.clinic.email ?? ""}</p>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="text-center"><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Recibo</p><p className="font-mono text-lg font-semibold">{receiptNumber}</p></div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Fatura" value={payment.invoice.number} /><Info label="Data" value={formatDatePt(payment.receivedAt)} />
            <Info label="Recebido de" value={payment.fromInsurer ? "Seguradora" : payment.patient?.name ?? "Paciente"} />
            <Info label="Paciente" value={payment.patient ? `${payment.patient.name} · ${payment.patient.code}` : "—"} />
            <Info label="Método" value={METHOD_LABEL[payment.method] ?? payment.method} /><Info label="Referência" value={payment.reference ?? "—"} />
          </div>
          <div className="divide-y divide-border rounded-lg border border-border">
            {payment.invoice.items.map((item) => <div key={item.id} className="flex justify-between gap-4 p-3 text-sm"><span>{item.description} × {item.quantity}</span><span className="tabular">{formatMZNExact(item.total)}</span></div>)}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-primary-muted p-4"><span className="font-medium">Valor recebido</span><span className="font-display text-xl font-semibold text-primary">{formatMZNExact(payment.amount)}</span></div>
          <p className="text-center text-xs text-muted-foreground">Documento emitido eletronicamente e associado à fatura {payment.invoice.number}.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>;
}
