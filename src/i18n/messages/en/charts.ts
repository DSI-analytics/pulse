import type { Messages } from "../../types";

/** English translations for the "charts" module. Must mirror ../pt/charts.ts. */
const charts: Messages["charts"] = {
  heatmap: {
    less: "Less busy",
    more: "Busier",
  },
  paymentMethods: {
    DINHEIRO: "Cash",
    MPESA: "M-Pesa",
    EMOLA: "e-Mola",
    CARTAO: "Card",
    TRANSFERENCIA: "Bank transfer",
    SEGURADORA: "Insurer",
  },
};

export default charts;
