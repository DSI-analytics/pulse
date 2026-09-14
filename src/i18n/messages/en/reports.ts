import type { Messages } from "../../types";

/** English translations for the "reports" module. Must mirror ../pt/reports.ts. */
const reports: Messages["reports"] = {
  eyebrow: "Management",
  title: "Reports",
  description: "Export as CSV or print. PDF export is planned for Phase 2.",
  csv: "CSV",
  currentMonth: "Current month",
  doctors: {
    title: "Revenue and occupancy by doctor",
    doctor: "Doctor",
    occupancy: "Occupancy",
    consultations: "Consultations",
    revenue: "Revenue",
  },
  specialties: {
    title: "Revenue by specialty",
    specialty: "Specialty",
    revenue: "Revenue",
  },
  plans: {
    title: "Receivables by health plan",
    description: "All open invoices",
    plan: "Plan",
    recognisedRevenue: "Recognised revenue (month)",
  },
  export: {
    invalidType: "Invalid report type.",
    doctor: "Doctor",
    specialty: "Specialty",
    consultations: "Consultations",
    revenue: "Revenue ({currency})",
    insurer: "Insurer",
    plan: "Plan",
    billed: "Billed ({currency})",
    received: "Received ({currency})",
    outstanding: "Outstanding ({currency})",
  },
};

export default reports;
