// Doctor occupancy & capacity metrics — pure functions (unit-testable).
//
// Definitions (see spec §10):
//   Schedule Occupancy = booked consultation time / available clinical time
//   Actual Utilisation = completed consultation time / available clinical time
//   Fill Rate          = booked slots / available slots
//   No-show Rate       = no-shows / scheduled
//   Cancellation Rate  = cancellations / scheduled

export interface AppointmentFact {
  status:
    | "MARCADA"
    | "CONFIRMADA"
    | "CHEGOU"
    | "EM_ESPERA"
    | "EM_CONSULTA"
    | "CONCLUIDA"
    | "CANCELADA"
    | "NAO_COMPARECEU";
  durationMin: number;
  revenueCentavos: number;
}

export interface OccupancyInput {
  availableMinutes: number; // total bookable clinical minutes in the period
  availableSlots: number; // total bookable slots in the period
  slotMinutes: number;
  appointments: AppointmentFact[];
  distinctDays: number; // clinical days in the period (for per-day averages)
}

export interface OccupancyMetrics {
  scheduleOccupancy: number; // 0..1
  actualUtilisation: number; // 0..1
  fillRate: number; // 0..1
  noShowRate: number; // 0..1
  cancellationRate: number; // 0..1
  scheduled: number;
  completed: number;
  noShows: number;
  cancellations: number;
  patientsPerDay: number;
  avgConsultationMin: number;
  revenueCentavos: number;
  revenuePerClinicalHour: number; // centavos
  availableSlotsRemaining: number;
  availableMinutesRemaining: number;
}

const ACTIVE = new Set([
  "MARCADA",
  "CONFIRMADA",
  "CHEGOU",
  "EM_ESPERA",
  "EM_CONSULTA",
  "CONCLUIDA",
]);

export function computeOccupancy(input: OccupancyInput): OccupancyMetrics {
  const { availableMinutes, availableSlots, appointments, distinctDays } = input;

  const scheduledAppts = appointments.filter((a) => a.status !== "CANCELADA");
  const active = appointments.filter((a) => ACTIVE.has(a.status));
  const completed = appointments.filter((a) => a.status === "CONCLUIDA");
  const noShows = appointments.filter((a) => a.status === "NAO_COMPARECEU");
  const cancellations = appointments.filter((a) => a.status === "CANCELADA");

  const bookedMinutes = active.reduce((s, a) => s + a.durationMin, 0);
  const completedMinutes = completed.reduce((s, a) => s + a.durationMin, 0);
  const revenueCentavos = completed.reduce((s, a) => s + a.revenueCentavos, 0);
  const bookedSlots = active.length;

  const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0);

  return {
    scheduleOccupancy: Math.min(1, safeDiv(bookedMinutes, availableMinutes)),
    actualUtilisation: Math.min(1, safeDiv(completedMinutes, availableMinutes)),
    fillRate: Math.min(1, safeDiv(bookedSlots, availableSlots)),
    noShowRate: safeDiv(noShows.length, scheduledAppts.length),
    cancellationRate: safeDiv(cancellations.length, appointments.length),
    scheduled: scheduledAppts.length,
    completed: completed.length,
    noShows: noShows.length,
    cancellations: cancellations.length,
    patientsPerDay: Math.round(safeDiv(completed.length, distinctDays) * 10) / 10,
    avgConsultationMin: Math.round(safeDiv(completedMinutes, completed.length)),
    revenueCentavos,
    revenuePerClinicalHour: Math.round(safeDiv(revenueCentavos, availableMinutes) * 60),
    availableSlotsRemaining: Math.max(0, availableSlots - bookedSlots),
    availableMinutesRemaining: Math.max(0, availableMinutes - bookedMinutes),
  };
}
