import { describe, expect, it } from "vitest";
import { REDACTED, changedFields, redact } from "./audit-redaction";

describe("redact", () => {
  it("removes credentials at any nesting level", () => {
    const out = redact({
      email: "ana@test.com",
      passwordHash: "$2a$10$abc",
      nested: { apiKey: "sk-live-123", token: "t", ok: 1 },
    })!;
    expect(out.passwordHash).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).apiKey).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).token).toBe(REDACTED);
    expect(out.email).toBe("ana@test.com");
  });

  it("replaces clinical free text with a length marker, never the content", () => {
    const out = redact({ diagnosis: "Hipertensão arterial estádio 2", notes: "" })!;
    expect(out.diagnosis).toBe("«texto clínico (30 car.)»");
    expect(String(out.diagnosis)).not.toContain("Hipertensão");
    expect(out.notes).toBe("");
  });

  it("truncates long non-clinical strings", () => {
    const out = redact({ address: "x".repeat(600) })!;
    expect(String(out.address)).toHaveLength(513);
  });

  it("serialises dates and stops at a bounded depth", () => {
    const out = redact({ at: new Date("2026-01-02T03:04:05.000Z"), a: { b: { c: { d: 1 } } } })!;
    expect(out.at).toBe("2026-01-02T03:04:05.000Z");
    const c = ((out.a as Record<string, unknown>).b as Record<string, unknown>).c as Record<string, unknown>;
    expect(c).toEqual({ d: 1 });
    // Um nível mais fundo é cortado, para o log não crescer sem limite.
    const deep = redact({ a: { b: { c: { d: { e: 1 } } } } })!;
    expect((((deep.a as Record<string, unknown>).b as Record<string, unknown>).c as Record<string, unknown>).d).toBe("«omitido»");
  });

  it("returns null for missing snapshots", () => {
    expect(redact(null)).toBeNull();
  });
});

describe("changedFields", () => {
  it("keeps only the fields that actually changed", () => {
    const diff = changedFields(
      { name: "Ana", phone: "840000000", city: "Maputo" },
      { name: "Ana Machava", phone: "840000000", city: "Maputo" },
    );
    expect(Object.keys(diff.before!)).toEqual(["name"]);
    expect(diff.before).toEqual({ name: "Ana" });
    expect(diff.after).toEqual({ name: "Ana Machava" });
  });

  it("records a clinical change without copying the text", () => {
    const diff = changedFields({ notes: "antes" }, { notes: "depois muito mais longo" });
    expect(diff.before!.notes).toBe("«texto clínico (5 car.)»");
    expect(diff.after!.notes).toBe("«texto clínico (23 car.)»");
  });

  it("passes through a one-sided snapshot", () => {
    expect(changedFields(null, { a: 1 })).toEqual({ before: null, after: { a: 1 } });
  });
});
