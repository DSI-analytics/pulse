import { describe, expect, it } from "vitest";
import { monthBuckets, resolvePeriod } from "./insights-periods";

// 2026-09-14T22:30Z = terça-feira, 15 de Setembro, 00:30 em Maputo (UTC+2).
const NOW = new Date("2026-09-14T22:30:00Z");
const TZ = "Africa/Maputo";
const iso = (date: Date) => date.toISOString();

describe("resolvePeriod (fuso da clínica)", () => {
  it("'hoje' começa à meia-noite local, não em UTC", () => {
    const window = resolvePeriod("hoje", TZ, NOW);
    expect(iso(window.from)).toBe("2026-09-14T22:00:00.000Z");
    expect(window.to).toEqual(NOW);
  });

  it("'ontem' cobre o dia local anterior completo", () => {
    const window = resolvePeriod("ontem", TZ, NOW);
    expect(iso(window.from)).toBe("2026-09-13T22:00:00.000Z");
    expect(iso(window.to)).toBe("2026-09-14T21:59:59.999Z");
  });

  it("'esta semana' começa na segunda-feira local", () => {
    const window = resolvePeriod("esta_semana", TZ, NOW);
    expect(iso(window.from)).toBe("2026-09-13T22:00:00.000Z");
    expect(iso(window.previousFrom)).toBe("2026-09-06T22:00:00.000Z");
  });

  it("'este mês' e 'mês anterior' seguem os meses locais", () => {
    const thisMonth = resolvePeriod("este_mes", TZ, NOW);
    expect(iso(thisMonth.from)).toBe("2026-08-31T22:00:00.000Z");
    expect(iso(thisMonth.previousFrom)).toBe("2026-07-31T22:00:00.000Z");
    // Comparação justa: o mesmo tempo decorrido (14 dias e meia hora) no mês anterior.
    expect(iso(thisMonth.previousTo)).toBe("2026-08-14T22:30:00.000Z");

    const lastMonth = resolvePeriod("mes_anterior", TZ, NOW);
    expect(iso(lastMonth.from)).toBe("2026-07-31T22:00:00.000Z");
    expect(iso(lastMonth.to)).toBe("2026-08-31T21:59:59.999Z");
  });

  it("'ano passado' cobre o ano civil anterior", () => {
    const window = resolvePeriod("ano_passado", TZ, NOW);
    expect(iso(window.from)).toBe("2024-12-31T22:00:00.000Z");
    expect(iso(window.to)).toBe("2025-12-31T21:59:59.999Z");
    expect(window.seriesMonths).toBe(12);
  });

  it("o gráfico mensal acompanha o período pedido", () => {
    expect(resolvePeriod("ultimos_3_meses", TZ, NOW).seriesMonths).toBe(3);
    expect(resolvePeriod("ultimos_6_meses", TZ, NOW).seriesMonths).toBe(6);
    expect(resolvePeriod("este_ano", TZ, NOW).seriesMonths).toBe(9);
  });
});

describe("monthBuckets", () => {
  it("devolve meses locais consecutivos até ao mês indicado", () => {
    const buckets = monthBuckets(NOW, 3, TZ);
    expect(buckets.map((bucket) => `${bucket.year}-${bucket.month}`)).toEqual(["2026-7", "2026-8", "2026-9"]);
    expect(iso(buckets[0].from)).toBe("2026-06-30T22:00:00.000Z");
    expect(iso(buckets[2].to)).toBe("2026-09-30T21:59:59.999Z");
  });

  it("atravessa a mudança de ano", () => {
    const buckets = monthBuckets(new Date("2026-02-10T10:00:00Z"), 4, TZ);
    expect(buckets.map((bucket) => `${bucket.year}-${bucket.month}`)).toEqual(["2025-11", "2025-12", "2026-1", "2026-2"]);
  });
});
