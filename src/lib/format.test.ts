import { describe, expect, it } from "vitest";
import {
  createFormatters,
  currencyFlag,
  currencyName,
  isValidCurrency,
  isValidTimeZone,
  parseMoneyInput,
  SUPPORTED_CURRENCIES,
} from "@/lib/format";
import { formatMZN, formatMZNExact } from "@/lib/money";
import { formatDateShort, formatTime } from "@/lib/datetime";

const instant = new Date("2026-09-14T22:30:00Z"); // já é dia 15 em Maputo

describe("formatos regionais", () => {
  const pt = createFormatters({ locale: "pt", currency: "MZN", timeZone: "Africa/Maputo" });
  const en = createFormatters({ locale: "en", currency: "USD", timeZone: "Africa/Maputo" });

  it("em PT com MZN mantém exactamente o formato histórico", () => {
    expect(pt.money(184_000_000)).toBe(formatMZN(184_000_000));
    expect(pt.moneyExact(150_050)).toBe(formatMZNExact(150_050));
    expect(pt.date(instant)).toBe(formatDateShort(instant));
    expect(pt.time(instant)).toBe(formatTime(instant));
  });

  it("respeita a moeda configurada e a convenção inglesa", () => {
    // O Intl separa o código do número com espaço inseparável (U+00A0).
    expect(en.money(184_000_000)).toBe("USD 1,840,000");
    expect(en.moneyExact(150_050)).toBe("USD 1,500.50");
    expect(createFormatters({ locale: "pt", currency: "EUR", timeZone: "UTC" }).money(99_900)).toBe("999 EUR");
  });

  it("aplica o fuso da clínica e usa sempre 24 h", () => {
    expect(en.date(instant)).toBe("15/09/2026");
    expect(en.time(instant)).toBe("00:30");
    expect(createFormatters({ locale: "en", currency: "USD", timeZone: "UTC" }).date(instant)).toBe("14/09/2026");
  });

  it("valida moedas e fusos", () => {
    expect(isValidCurrency("MZN")).toBe(true);
    expect(isValidCurrency("mzn")).toBe(false);
    expect(isValidCurrency("XX")).toBe(false);
    expect(isValidTimeZone("Africa/Maputo")).toBe(true);
    expect(isValidTimeZone("Marte/Olimpo")).toBe(false);
  });

  it("oferece as moedas lusófonas com as bandeiras correctas", () => {
    expect(SUPPORTED_CURRENCIES).toEqual([
      "MZN",
      "AOA",
      "STN",
      "XOF",
      "CVE",
      "ZAR",
      "EUR",
      "USD",
    ]);
    expect(currencyFlag("AOA")).toBe("/flags/ao.svg");
    expect(currencyFlag("STN")).toBe("/flags/st.svg");
    expect(currencyFlag("XOF")).toBe("/flags/gw.svg");
    expect(currencyFlag("CVE")).toBe("/flags/cv.svg");
    expect(currencyFlag("EUR")).toBe("/flags/Ficheiro_Flag_of_Europe.svg");
    expect(currencyFlag("GBP")).toBeNull();
    expect(currencyName("MZN", "pt")).toBe("Metical");
    expect(currencyName("AOA", "pt")).toBe("Kwanza");
    expect(currencyName("STN", "pt")).toBe("Dobra");
    expect(currencyName("CVE", "pt")).toBe("Escudo");
    expect(currencyName("USD", "en")).toBe("Dollar");
  });
});

describe("parseMoneyInput", () => {
  it.each([
    ["1.500,50", 150_050],
    ["1,500.50", 150_050],
    ["1 500,5", 150_050],
    ["1500", 150_000],
    ["1.500", 150_000],
    ["1,500", 150_000],
    ["2.000.000", 200_000_000],
    ["MZN 750", 75_000],
  ])("%s → %i centavos", (input, cents) => {
    expect(parseMoneyInput(input)).toBe(cents);
  });

  it("devolve null quando não há número", () => {
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("")).toBeNull();
  });
});
