"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, CheckCircle2, ExternalLink } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { registerInvoicePayment, type PaymentValues } from "@/server/billing-actions";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useFormat, useT } from "@/i18n/client";

const PAYMENT_METHODS = ["DINHEIRO", "MPESA", "EMOLA", "CARTAO", "TRANSFERENCIA", "SEGURADORA"] as const;

/** Valor inicial do campo (editável; interpretado com parseMoneyInput no servidor). */
function inputAmount(centavos: number) {
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
  const t = useT();
  const f = useFormat();
  const defaultInsurer = patientOutstanding === 0 && insurerOutstanding > 0;
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [fromInsurer, setFromInsurer] = React.useState(defaultInsurer);
  const [amount, setAmount] = React.useState(inputAmount(defaultInsurer ? insurerOutstanding : patientOutstanding));
  const [method, setMethod] = React.useState(defaultInsurer ? "TRANSFERENCIA" : "DINHEIRO");
  const [reference, setReference] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<{ id: string; number: string } | null>(null);

  function payerChange(value: string) {
    const insurer = value === "insurer";
    setFromInsurer(insurer);
    setAmount(inputAmount(insurer ? insurerOutstanding : patientOutstanding));
    if (insurer) setMethod("TRANSFERENCIA");
  }

  function openForm() {
    const insurer = patientOutstanding === 0 && insurerOutstanding > 0;
    setFromInsurer(insurer);
    setAmount(inputAmount(insurer ? insurerOutstanding : patientOutstanding));
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
    toast(t("finance.payment.toast"));
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={openForm}><Banknote /> {t("finance.payment.receive")}</Button>
      {open && (
        <Modal
          open
          onClose={() => !saving && setOpen(false)}
          title={receipt ? t("finance.payment.registeredTitle") : t("finance.payment.receiveTitle", { number: invoiceNumber })}
          description={receipt ? t("finance.payment.registeredDescription") : t("finance.payment.formDescription")}
          footer={receipt ? <Button onClick={() => setOpen(false)}>{t("finance.payment.done")}</Button> : <><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button onClick={submit} disabled={saving}>{saving ? <ProcessingPulse /> : <Banknote />} {t("finance.payment.submit")}</Button></>}
        >
          {receipt ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto size-10 text-success" />
              <div><p className="text-sm text-muted-foreground">{t("finance.payment.receiptIssued")}</p><p className="font-mono text-lg font-semibold">{receipt.number}</p></div>
              <Link href={`/financeiro/recibos/${receipt.id}`} target="_blank" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">{t("finance.payment.openReceipt")} <ExternalLink className="size-4" /></Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor={`payer-${invoiceId}`}>{t("finance.payment.payer")}</Label>
                <Select id={`payer-${invoiceId}`} className="mt-1.5" value={fromInsurer ? "insurer" : "patient"} onChange={(event) => payerChange(event.target.value)}>
                  {patientOutstanding > 0 && <option value="patient">{t("finance.payment.payerPatient", { amount: f.moneyExact(patientOutstanding) })}</option>}
                  {insurerOutstanding > 0 && <option value="insurer">{t("finance.payment.payerInsurer", { amount: f.moneyExact(insurerOutstanding) })}</option>}
                </Select>
              </div>
              <div><Label htmlFor={`amount-${invoiceId}`}>{t("finance.payment.amount", { currency: f.currency })}</Label><Input id={`amount-${invoiceId}`} className="mt-1.5" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
              <div><Label htmlFor={`method-${invoiceId}`}>{t("finance.payment.method")}</Label><Select id={`method-${invoiceId}`} className="mt-1.5" value={method} onChange={(event) => setMethod(event.target.value)}>{PAYMENT_METHODS.map((value) => <option key={value} value={value}>{t(`finance.methods.${value}`)}</option>)}</Select></div>
              <div className="sm:col-span-2"><Label htmlFor={`reference-${invoiceId}`}>{t("finance.payment.reference")}</Label><Input id={`reference-${invoiceId}`} className="mt-1.5" value={reference} onChange={(event) => setReference(event.target.value)} placeholder={t("finance.payment.referencePlaceholder")} /></div>
              {error && <p className="sm:col-span-2 rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
