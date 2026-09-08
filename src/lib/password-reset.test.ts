import { describe, expect, it } from "vitest";
import { generateResetCode, hashResetCode, resetCodesMatch } from "./password-reset";

describe("password reset codes", () => {
  it("generates a six-digit code", () => {
    expect(generateResetCode()).toMatch(/^\d{6}$/);
  });

  it("hashes and compares a code without storing it in plain text", () => {
    const hash = hashResetCode("012345", "user-1", "test-secret");
    expect(hash).not.toContain("012345");
    expect(resetCodesMatch("012345", hash, "user-1", "test-secret")).toBe(true);
    expect(resetCodesMatch("543210", hash, "user-1", "test-secret")).toBe(false);
  });

  it("binds the code to its user", () => {
    const hash = hashResetCode("012345", "user-1", "test-secret");
    expect(resetCodesMatch("012345", hash, "user-2", "test-secret")).toBe(false);
  });
});
