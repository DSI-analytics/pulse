import { describe, expect, it } from "vitest";
import { BAR_MIN_STRENGTH, barColor, barStrength } from "./chart-color";

describe("barStrength", () => {
  it("dá intensidade máxima à primeira barra e mínima à última", () => {
    expect(barStrength(0, 4)).toBe(100);
    expect(barStrength(3, 4)).toBe(BAR_MIN_STRENGTH);
  });

  it("distribui uma tonalidade diferente para cada barra", () => {
    const strengths = Array.from({ length: 4 }, (_, index) => barStrength(index, 4));
    expect(strengths).toEqual([100, 81.67, 63.33, 45]);
    expect(new Set(strengths).size).toBe(strengths.length);
  });

  it("é robusto a séries vazias e posições fora do intervalo", () => {
    expect(barStrength(0, 0)).toBe(BAR_MIN_STRENGTH);
    expect(barStrength(Number.NaN, 4)).toBe(BAR_MIN_STRENGTH);
    expect(barStrength(-10, 4)).toBe(100);
    expect(barStrength(20, 4)).toBe(BAR_MIN_STRENGTH);
    expect(barStrength(0, 1)).toBe(100);
  });
});

describe("barColor", () => {
  it("usa a cor base pura na primeira barra e mistura nas seguintes", () => {
    expect(barColor(0, 3)).toBe("var(--primary)");
    expect(barColor(1, 3)).toBe("color-mix(in oklch, var(--primary) 72.5%, var(--card))");
  });

  it("respeita a cor própria da série (ex.: especialidade)", () => {
    expect(barColor(3, 4, "oklch(54% 0.15 250)")).toBe("color-mix(in oklch, oklch(54% 0.15 250) 45%, var(--card))");
  });
});
