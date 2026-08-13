import { describe, it, expect } from "vitest";
import { computeOccupancy, type AppointmentFact } from "./occupancy";

const A = (status: AppointmentFact["status"], revenueCentavos = 0): AppointmentFact => ({
  status,
  durationMin: 30,
  revenueCentavos,
});

describe("computeOccupancy", () => {
  it("computes schedule occupancy from booked vs available time", () => {
    const m = computeOccupancy({
      availableMinutes: 300, // 10 slots
      availableSlots: 10,
      slotMinutes: 30,
      distinctDays: 1,
      appointments: [A("CONFIRMADA"), A("CONCLUIDA"), A("MARCADA"), A("CANCELADA")],
    });
    // 3 active * 30min = 90 / 300 = 0.3
    expect(m.scheduleOccupancy).toBeCloseTo(0.3, 5);
    expect(m.fillRate).toBeCloseTo(0.3, 5);
  });

  it("computes actual utilisation from completed time only", () => {
    const m = computeOccupancy({
      availableMinutes: 300, availableSlots: 10, slotMinutes: 30, distinctDays: 1,
      appointments: [A("CONCLUIDA"), A("CONCLUIDA"), A("CONFIRMADA")],
    });
    expect(m.actualUtilisation).toBeCloseTo(60 / 300, 5);
    expect(m.completed).toBe(2);
  });

  it("computes no-show and cancellation rates", () => {
    const m = computeOccupancy({
      availableMinutes: 300, availableSlots: 10, slotMinutes: 30, distinctDays: 1,
      appointments: [A("CONCLUIDA"), A("NAO_COMPARECEU"), A("NAO_COMPARECEU"), A("CANCELADA")],
    });
    // scheduled excludes cancelled => 3 scheduled, 2 no-show
    expect(m.noShowRate).toBeCloseTo(2 / 3, 5);
    // cancellation over all appointments = 1/4
    expect(m.cancellationRate).toBeCloseTo(0.25, 5);
  });

  it("computes revenue per clinical hour", () => {
    const m = computeOccupancy({
      availableMinutes: 120, availableSlots: 4, slotMinutes: 30, distinctDays: 1,
      appointments: [A("CONCLUIDA", 150000), A("CONCLUIDA", 150000)],
    });
    // 300000 centavos over 120 min => per hour = 300000 * 60/120 = 150000
    expect(m.revenueCentavos).toBe(300000);
    expect(m.revenuePerClinicalHour).toBe(150000);
  });

  it("reports remaining capacity", () => {
    const m = computeOccupancy({
      availableMinutes: 300, availableSlots: 10, slotMinutes: 30, distinctDays: 1,
      appointments: [A("CONFIRMADA"), A("CONCLUIDA")],
    });
    expect(m.availableSlotsRemaining).toBe(8);
    expect(m.availableMinutesRemaining).toBe(240);
  });

  it("caps occupancy at 100%", () => {
    const m = computeOccupancy({
      availableMinutes: 60, availableSlots: 2, slotMinutes: 30, distinctDays: 1,
      appointments: [A("CONCLUIDA"), A("CONCLUIDA"), A("CONFIRMADA"), A("CONFIRMADA")],
    });
    expect(m.scheduleOccupancy).toBeLessThanOrEqual(1);
  });
});
