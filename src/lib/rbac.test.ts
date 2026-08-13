import { describe, it, expect } from "vitest";
import { can, ROLE_PERMISSIONS } from "./rbac";

describe("RBAC permission matrix", () => {
  it("gives clinic admin full access", () => {
    expect(can("CLINIC_ADMIN", "finance.manage")).toBe(true);
    expect(can("CLINIC_ADMIN", "inventory.manage")).toBe(true);
    expect(can("CLINIC_ADMIN", "user.manage")).toBe(true);
  });

  it("lets receptionists manage appointments but not finance", () => {
    expect(can("RECEPTIONIST", "appointment.manage")).toBe(true);
    expect(can("RECEPTIONIST", "appointment.checkin")).toBe(true);
    expect(can("RECEPTIONIST", "finance.view")).toBe(false);
    expect(can("RECEPTIONIST", "finance.manage")).toBe(false);
  });

  it("lets doctors conduct consultations and see clinical notes", () => {
    expect(can("DOCTOR", "consultation.conduct")).toBe(true);
    expect(can("DOCTOR", "consultation.viewClinical")).toBe(true);
    expect(can("DOCTOR", "doctor.stats")).toBe(true);
    expect(can("DOCTOR", "inventory.manage")).toBe(false);
  });

  it("scopes finance role to money, not inventory", () => {
    expect(can("FINANCE", "finance.manage")).toBe(true);
    expect(can("FINANCE", "healthplan.manage")).toBe(true);
    expect(can("FINANCE", "inventory.manage")).toBe(false);
    expect(can("FINANCE", "consultation.viewClinical")).toBe(false);
  });

  it("scopes inventory manager to stock and suppliers", () => {
    expect(can("INVENTORY_MANAGER", "inventory.manage")).toBe(true);
    expect(can("INVENTORY_MANAGER", "supplier.manage")).toBe(true);
    expect(can("INVENTORY_MANAGER", "finance.manage")).toBe(false);
    expect(can("INVENTORY_MANAGER", "patient.view")).toBe(false);
  });

  it("never grants clinical note access to receptionists", () => {
    expect(can("RECEPTIONIST", "consultation.viewClinical")).toBe(false);
  });

  it("defines a permission set for every role", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});
