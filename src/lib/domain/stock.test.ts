import { describe, it, expect } from "vitest";
import { applyMovement, movingAverageCost } from "./stock";

describe("applyMovement", () => {
  it("adds stock on ENTRADA", () => {
    expect(applyMovement(4, "ENTRADA", 20)).toEqual({ delta: 20, newStock: 24 });
  });

  it("subtracts stock on SAIDA", () => {
    expect(applyMovement(24, "SAIDA", 5)).toEqual({ delta: -5, newStock: 19 });
  });

  it("refuses a withdrawal larger than the stock on hand", () => {
    const res = applyMovement(3, "SAIDA", 10);
    expect(res).toHaveProperty("error");
  });

  it("allows withdrawing exactly the remaining stock", () => {
    expect(applyMovement(3, "SAIDA", 3)).toEqual({ delta: -3, newStock: 0 });
  });

  it("treats PERDA as a withdrawal", () => {
    expect(applyMovement(10, "PERDA", 2)).toEqual({ delta: -2, newStock: 8 });
  });

  it("sets the counted quantity on AJUSTE and records the difference", () => {
    expect(applyMovement(10, "AJUSTE", 7)).toEqual({ delta: -3, newStock: 7 });
    expect(applyMovement(10, "AJUSTE", 13)).toEqual({ delta: 3, newStock: 13 });
  });

  it("rejects non-positive quantities", () => {
    expect(applyMovement(10, "SAIDA", 0)).toHaveProperty("error");
    expect(applyMovement(10, "ENTRADA", -5)).toHaveProperty("error");
  });
});

describe("movingAverageCost", () => {
  it("blends the old and new unit costs by quantity", () => {
    // 4 units @ 850 + 20 units @ 900 -> 891,67 MZN (in centavos)
    expect(movingAverageCost(4, 85000, 20, 90000)).toBe(89167);
  });

  it("uses the purchase cost when there was no stock", () => {
    expect(movingAverageCost(0, 0, 10, 62000)).toBe(62000);
  });

  it("keeps the cost stable when buying at the same price", () => {
    expect(movingAverageCost(10, 50000, 10, 50000)).toBe(50000);
  });
});
