import { describe, expect, it } from "vitest";
import { normalizePatientData } from "./patient-data";

describe("normalizePatientData", () => {
  it("sanitizes optional fields and preserves a valid gender", () => {
    expect(
      normalizePatientData({
        name: "  Ana Machava  ",
        phone: "  840000000  ",
        email: "  ana@test.com  ",
        address: "  Av. 10  ",
        gender: "FEMININO",
        birthDate: "2020-02-01",
        emergencyContactName: "  Maria  ",
        emergencyContactPhone: "  ",
      }),
    ).toEqual({
      name: "Ana Machava",
      phone: "840000000",
      email: "ana@test.com",
      address: "Av. 10",
      gender: "FEMININO",
      birthDate: new Date("2020-02-01T00:00:00.000Z"),
      emergencyContactName: "Maria",
      emergencyContactPhone: null,
    });
  });

  it("converts invalid gender and empty values to null-safe payload", () => {
    expect(
      normalizePatientData({
        name: "João",
        gender: "INVALID",
        birthDate: "",
        phone: "",
        email: "",
        address: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
      }),
    ).toEqual({
      name: "João",
      phone: null,
      email: null,
      address: null,
      gender: null,
      birthDate: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
    });
  });
});
