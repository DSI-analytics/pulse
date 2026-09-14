import type { Messages } from "../../types";

/** English translations for the "appointmentStatus" module. Must mirror ../pt/appointmentStatus.ts. */
const appointmentStatus: Messages["appointmentStatus"] = {
  MARCADA: "Booked",
  CONFIRMADA: "Confirmed",
  CHEGOU: "Arrived",
  EM_ESPERA: "Waiting",
  EM_CONSULTA: "In Consultation",
  CONCLUIDA: "Completed",
  CANCELADA: "Cancelled",
  NAO_COMPARECEU: "No-show",
};

export default appointmentStatus;
