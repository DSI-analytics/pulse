import { describe, expect, it } from "vitest";
import pt from "@/i18n/messages/pt";
import { createTranslator } from "@/i18n/translate";
import { createFormatters } from "@/lib/format";
import { narrate, type FormatValue } from "./insights-narrative";

const t = createTranslator(pt);
const f = createFormatters({ locale: "pt", currency: "MZN", timeZone: "Africa/Maputo" });
const format: FormatValue = (unit, value) =>
  unit === "currency" ? f.money(value) : unit === "percent" ? `${value}%` : unit === "minutes" ? `${value} min` : f.number(value);

describe("narrate", () => {
  it("nomeia quem lidera um ranking, com a quota do total", () => {
    const text = narrate(
      {
        label: "Consultas por profissional",
        unit: "count",
        shape: "ranking",
        value: 100,
        series: [
          { label: "Dra. Ana", value: 50 },
          { label: "Dr. Rui", value: 30 },
          { label: "Dr. Tomás", value: 20 },
        ],
      },
      "este mês",
      t,
      format,
    );
    expect(text).toContain("Dra. Ana");
    expect(text).toContain("50%");
    expect(text).toContain("Dr. Rui (30)");
  });

  it("indica o pico e o mínimo de movimento", () => {
    const text = narrate(
      {
        label: "Movimento por dia da semana",
        unit: "count",
        shape: "peaks",
        value: 60,
        series: [
          { label: "Segunda", value: 25 },
          { label: "Terça", value: 20 },
          { label: "Sábado", value: 5 },
          { label: "Domingo", value: 0 },
        ],
      },
      "este mês",
      t,
      format,
    );
    expect(text).toContain("Segunda");
    expect(text).toContain("Sábado");
    expect(text).not.toContain("Domingo");
  });

  it("resume a tendência de uma série mensal", () => {
    const text = narrate(
      {
        label: "Evolução da receita",
        unit: "currency",
        shape: "series",
        value: 600_000,
        series: [
          { label: "Jul/26", value: 100_000 },
          { label: "Ago/26", value: 200_000 },
          { label: "Set/26", value: 300_000 },
        ],
      },
      "os últimos 3 meses",
      t,
      format,
    );
    expect(text).toContain("Set/26");
    expect(text).toContain("+200%");
  });

  it("diz claramente quando não há dados", () => {
    const text = narrate({ label: "Procura por especialidade", unit: "count", shape: "ranking", value: 0, series: [] }, "hoje", t, format);
    expect(text).toContain("ainda não há dados");
  });

  it("destaca quem mais cresceu (não quem tem mais volume)", () => {
    const base = { label: "Crescimento por especialidade", unit: "count" as const, shape: "growth" as const, value: 90 };
    const series = [
      { label: "Medicina Geral", value: 60 },
      { label: "Dermatologia", value: 30 },
    ];
    const grew = narrate({ ...base, series, highlights: ["Dermatologia (+50%)"] }, "este mês", t, format);
    expect(grew).toContain("Dermatologia (+50%)");
    expect(grew).not.toContain("Medicina Geral");

    const flat = narrate({ ...base, series, highlights: [] }, "este mês", t, format);
    expect(flat).toContain("nenhuma especialidade cresceu");
  });

  it("compara um valor com o período anterior", () => {
    const text = narrate(
      { label: "Receita do período", unit: "currency", shape: "value", value: 150_000, previousValue: 100_000, changePct: 50 },
      "este mês",
      t,
      format,
    );
    expect(text).toContain("1.500 MZN");
    expect(text).toContain("+50%");
  });
});
