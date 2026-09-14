import type { Messages } from "../../types";

/** English translations for the "plans" module. Must mirror ../pt/plans.ts. */
const plans: Messages["plans"] = {
  title: "Health Plans",
  description: "{count} plans · {amount} receivable from insurers",
  newPlan: "New plan",
  newPlanTitle: "New health plan",
  editTitle: "Edit plan",
  editDescription: "Update the health plan's details.",
  fields: {
    insurer: "Insurer",
    name: "Plan name",
    namePlaceholder: "E.g. Executive",
    contractPrice: "Contract price",
    copay: "Co-payment",
  },
  searchPlaceholder: "Plan name…",
  columns: {
    insurerPlan: "Insurer / Plan",
    consultations: "Consultations",
    billed: "Billed",
    received: "Received",
    pending: "Receivable",
    term: "Term",
  },
  contractLine: "{plan} · contract {price}",
  termDays: "{days}d",
  empty: "No plans match the filters.",
};

export default plans;
