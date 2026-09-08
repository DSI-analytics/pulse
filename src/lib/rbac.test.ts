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

describe("Gestor da Clínica (CLINIC_MANAGER)", () => {
  it("has Insights and read-only management visibility", () => {
    expect(can("CLINIC_MANAGER", "insights.view")).toBe(true);
    expect(can("CLINIC_MANAGER", "dashboard.view")).toBe(true);
    expect(can("CLINIC_MANAGER", "report.view")).toBe(true);
    expect(can("CLINIC_MANAGER", "finance.view")).toBe(true);
    expect(can("CLINIC_MANAGER", "doctor.stats")).toBe(true);
  });

  it("does NOT get administrative privileges", () => {
    expect(can("CLINIC_MANAGER", "user.manage")).toBe(false);
    expect(can("CLINIC_MANAGER", "settings.manage")).toBe(false);
    expect(can("CLINIC_MANAGER", "audit.view")).toBe(false);
    expect(can("CLINIC_MANAGER", "fhir.access")).toBe(false);
  });

  it("does NOT get write access to clinical or financial data", () => {
    expect(can("CLINIC_MANAGER", "consultation.viewClinical")).toBe(false);
    expect(can("CLINIC_MANAGER", "consultation.conduct")).toBe(false);
    expect(can("CLINIC_MANAGER", "prescription.create")).toBe(false);
    expect(can("CLINIC_MANAGER", "patient.manage")).toBe(false);
    expect(can("CLINIC_MANAGER", "finance.manage")).toBe(false);
    expect(can("CLINIC_MANAGER", "appointment.manage")).toBe(false);
  });
});

describe("audit access", () => {
  it("is restricted to system administrators by default", () => {
    expect(can("SUPER_ADMIN", "audit.view")).toBe(true);
    expect(can("CLINIC_ADMIN", "audit.view")).toBe(true);
    for (const role of ["CLINIC_MANAGER", "DOCTOR", "NURSE", "RECEPTIONIST", "FINANCE", "LAB_TECHNICIAN", "PHARMACIST", "INVENTORY_MANAGER"] as const) {
      expect(can(role, "audit.view")).toBe(false);
    }
  });
});

describe("clinical permissions by role", () => {
  it("gives nurses vitals and allergies but never prescriptions", () => {
    expect(can("NURSE", "vitals.record")).toBe(true);
    expect(can("NURSE", "allergy.manage")).toBe(true);
    expect(can("NURSE", "prescription.create")).toBe(false);
    expect(can("NURSE", "consultation.conduct")).toBe(false);
  });

  it("scopes lab technicians to the laboratory module", () => {
    expect(can("LAB_TECHNICIAN", "laboratory.manage")).toBe(true);
    expect(can("LAB_TECHNICIAN", "consultation.viewClinical")).toBe(false);
    expect(can("LAB_TECHNICIAN", "finance.view")).toBe(false);
  });

  it("keeps the FHIR API closed to everyone but administrators", () => {
    expect(can("SUPER_ADMIN", "fhir.access")).toBe(true);
    expect(can("DOCTOR", "fhir.access")).toBe(false);
    expect(can("RECEPTIONIST", "fhir.access")).toBe(false);
  });
});
