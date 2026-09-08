"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { registerInvoicePayment, type PaymentValues } from "@/server/billing-actions";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

function inputMZN(centavos: number) {
  return (centavos / 100).toFixed(2);
}

export function InvoicePaymentButton({ invoiceId, invoiceNumber, patientOutstanding, insurerOutstanding }: {
  invoiceId: string;
  invoiceNumber: string;
  patientOutstanding: number;
  insurerOutstanding: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const defaultInsurer = patientOutstanding === 0 && insurerOutstanding > 0;
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [fromInsurer, setFromInsurer] = React.useState(defaultInsurer);
  const [amount, setAmount] = React.useState(inputMZN(defaultInsurer ? insurerOutstanding : patientOutstanding));
  const [method, setMethod] = React.useState(defaultInsurer ? "TRANSFERENCIA" : "DINHEIRO");
  const [reference, setReference] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<{ id: string; number: string } | null>(null);

  function payerChange(value: string) {
    const insurer = value === "insurer";
    setFromInsurer(insurer);
    setAmount(inputMZN(insurer ? insurerOutstanding : patientOutstanding));
    if (insurer) setMethod("TRANSFERENCIA");
  }

  function openForm() {
    const insurer = patientOutstanding === 0 && insurerOutstanding > 0;
    setFromInsurer(insurer);
    setAmount(inputMZN(insurer ? insurerOutstanding : patientOutstanding));
    setMethod(insurer ? "TRANSFERENCIA" : "DINHEIRO");
    setReference("");
    setReceipt(null);
    setError(null);
    setOpen(true);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await registerInvoicePayment(invoiceId, { amount, method: method as PaymentValues["method"], reference, fromInsurer });
    setSaving(false);
    if ("error" in result) return setError(result.error);
    setReceipt({ id: result.paymentId, number: result.receiptNumber });
    toast("Pagamento registado e reconciliado");
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={openForm}><Banknote /> Receber</Button>
      {open && (
        <Modal
          open
          onClose={() => !saving && setOpen(false)}
          title={receipt ? "Pagamento registado" : `Receber ${invoiceNumber}`}
          description={receipt ? "A fatura e a receita foram reconciliadas." : "Registe um pagamento total ou parcial."}
          footer={receipt ? <Button onClick={() => setOpen(false)}>Concluir</Button> : <><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Banknote />} Registar pagamento</Button></>}
        >
          {receipt ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto size-10 text-success" />
              <div><p className="text-sm text-muted-foreground">Recibo emitido</p><p className="font-mono text-lg font-semibold">{receipt.number}</p></div>
              <Link href={`/financeiro/recibos/${receipt.id}`} target="_blank" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">Abrir recibo <ExternalLink className="size-4" /></Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor={`payer-${invoiceId}`}>Responsável pelo pagamento</Label>
                <Select id={`payer-${invoiceId}`} className="mt-1.5" value={fromInsurer ? "insurer" : "patient"} onChange={(event) => payerChange(event.target.value)}>
                  {patientOutstanding > 0 && <option value="patient">Paciente · saldo {inputMZN(patientOutstanding)} MZN</option>}
                  {insurerOutstanding > 0 && <option value="insurer">Seguradora · saldo {inputMZN(insurerOutstanding)} MZN</option>}
                </Select>
              </div>
              <div><Label htmlFor={`amount-${invoiceId}`}>Valor recebido (MZN)</Label><Input id={`amount-${invoiceId}`} className="mt-1.5" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
              <div><Label htmlFor={`method-${invoiceId}`}>Método</Label><Select id={`method-${invoiceId}`} className="mt-1.5" value={method} onChange={(event) => setMethod(event.target.value)}><option value="DINHEIRO">Dinheiro</option><option value="MPESA">M-Pesa</option><option value="EMOLA">e-Mola</option><option value="CARTAO">Cartão</option><option value="TRANSFERENCIA">Transferência</option><option value="SEGURADORA">Seguradora</option></Select></div>
              <div className="sm:col-span-2"><Label htmlFor={`reference-${invoiceId}`}>Referência</Label><Input id={`reference-${invoiceId}`} className="mt-1.5" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Transação, cheque ou referência bancária" /></div>
              {error && <p className="sm:col-span-2 rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
