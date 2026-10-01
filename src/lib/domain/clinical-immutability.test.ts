import { describe, expect, it } from "vitest";
import { isImmutabilityError } from "./clinical-immutability";

describe("isImmutabilityError", () => {
  it("recognises the trigger message", () => {
    const error = new Error('Registo clinico imutavel: UPDATE nao e permitido em "Diagnosis"');
    expect(isImmutabilityError(error)).toBe(true);
  });

  it("recognises the PostgreSQL error code carried in meta", () => {
    const error = Object.assign(new Error("Raw query failed"), { meta: { code: "42501", message: "…" } });
    expect(isImmutabilityError(error)).toBe(true);
  });

  it("recognises the symbolic error code", () => {
    expect(isImmutabilityError(new Error("insufficient_privilege"))).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isImmutabilityError(new Error("Unique constraint failed"))).toBe(false);
    expect(isImmutabilityError(null)).toBe(false);
    expect(isImmutabilityError(undefined)).toBe(false);
  });
});
