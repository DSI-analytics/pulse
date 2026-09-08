import { describe, expect, it } from "vitest";
import { reconcileBilling, splitInvoice } from "./billing";

describe("splitInvoice", () => {
  it("atribui o total ao paciente numa consulta particular", () => {
    expect(splitInvoice(150000, false, 0)).toEqual({ patientDue: 150000, insurerDue: 0 });
  });

  it("separa copagamento e responsabilidade da seguradora", () => {
    expect(splitInvoice(200000, true, 25000)).toEqual({ patientDue: 25000, insurerDue: 175000 });
  });

  it("limita o copagamento ao total da fatura", () => {
    expect(splitInvoice(10000, true, 15000)).toEqual({ patientDue: 10000, insurerDue: 0 });
  });
});

describe("reconcileBilling", () => {
  it("mantém uma fatura sem pagamentos como emitida e pendente", () => {
    expect(reconcileBilling({ patientDue: 20000, insurerDue: 80000, patientPaid: 0, insurerPaid: 0 })).toMatchObject({
      amountPaid: 0, outstanding: 100000, invoiceStatus: "EMITIDA", revenueStatus: "PENDENTE",
    });
  });

  it("reconcilia pagamentos parciais por responsável", () => {
    expect(reconcileBilling({ patientDue: 20000, insurerDue: 80000, patientPaid: 20000, insurerPaid: 30000 })).toMatchObject({
      amountPaid: 50000, patientOutstanding: 0, insurerOutstanding: 50000,
      invoiceStatus: "PARCIAL", revenueStatus: "PARCIAL",
    });
  });

  it("marca fatura e receita como pagas quando ambos os saldos terminam", () => {
    expect(reconcileBilling({ patientDue: 20000, insurerDue: 80000, patientPaid: 20000, insurerPaid: 80000 })).toMatchObject({
      outstanding: 0, invoiceStatus: "PAGA", revenueStatus: "PAGO",
    });
  });
});
