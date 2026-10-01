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
    copayMode: "Participation type",
    copayFixed: "Fixed amount",
    copayPercentage: "Percentage",
  },
  copayModes: {
    FIXED: "Fixed amount",
    PERCENTAGE: "Percentage",
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
  participationFixed: "Patient participation: {amount}",
  participationPercentage: "Patient participation: {percentage}%",
  termDays: "{days}d",
  empty: "No plans match the filters.",
  errors: {
    invalidCopay: "Enter a valid amount or a percentage between 0 and 100.",
  },
};

export default plans;
