import type { Messages } from "../../types";

/** English translations for the "consultations" module. Must mirror ../pt/consultations.ts. */
const consultations: Messages["consultations"] = {
  title: "Consultations",
  description: "Scheduled consultations and clinical records.",
  empty: "No consultations recorded",
  columns: {
    date: "Date",
    patient: "Patient",
    doctor: "Doctor",
    specialty: "Specialty",
    type: "Type",
    status: "Status",
    clinicalNotes: "Clinical notes",
    actions: "Actions",
  },
  restricted: "Restricted",
  editor: {
    editRecord: "Edit record",
    open: "Open",
    register: "Record consultation",
    editTitle: "Edit clinical consultation",
    title: "Clinical consultation",
    loading: "Loading consultation data…",
    save: "Save",
    saveAndComplete: "Save and complete",
    completedToast: "Consultation completed and clinical record saved",
    savedToast: "Clinical record saved",
    fields: {
      subjective: "Chief complaint",
      subjectivePlaceholder: "Reason for the visit and how symptoms have progressed…",
      diagnosis: "Diagnosis",
      diagnosisPlaceholder: "Clinical diagnosis or differential…",
      notes: "Clinical notes",
      notesPlaceholder: "Observations, physical examination and findings…",
      prescription: "Prescription",
      prescriptionPlaceholder: "Medication, dose, route and duration…",
      recommendations: "Recommendations",
      recommendationsPlaceholder: "Care, warning signs and guidance…",
      followUpDate: "Follow-up date",
    },
  },
  errors: {
    textTooLong: "Text cannot exceed 10,000 characters.",
    invalidFollowUp: "Invalid follow-up date.",
    noPermission: "You do not have permission to record clinical consultations.",
    notFound: "Consultation not found.",
    ownAgendaOnly: "You can only edit consultations in your own schedule.",
    cancelled: "A cancelled or no-show consultation cannot be edited.",
    startFirst: "Start the consultation before opening the clinical record.",
    startBeforeComplete: "Start the consultation before completing it.",
  },
};

export default consultations;
