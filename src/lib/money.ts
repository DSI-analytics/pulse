// Money is stored everywhere as integer centavos (1 MZN = 100 centavos).
// Display uses dot-grouped thousands + " MZN", e.g. 184000000 -> "1.840.000 MZN".

const grouper = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const grouper2 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format centavos as MZN with no decimals: 184000000 -> "1.840.000 MZN". */
export function formatMZN(centavos: number): string {
  return `${grouper.format(Math.round(centavos / 100))} MZN`;
}

/** Format centavos with two decimals: 150050 -> "1.500,50 MZN". */
export function formatMZNExact(centavos: number): string {
  return `${grouper2.format(centavos / 100)} MZN`;
}

/** Compact form for tight spaces: 1840000_00 -> "1,84 M MZN". */
export function formatMZNCompact(centavos: number): string {
  const v = centavos / 100;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2).replace(".", ",")} M MZN`;
  if (Math.abs(v) >= 1_000) return `${(v / 1000).toFixed(0)}k MZN`;
  return `${grouper.format(v)} MZN`;
}

/** Parse a user-typed MZN string ("1.500,50" or "1500.5") into centavos. */
export function parseMZN(input: string): number {
  const cleaned = input.trim().replace(/\s|MZN/gi, "");
  // If both separators present, assume dot=thousands, comma=decimal (pt style).
  let normalised = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalised = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalised = cleaned.replace(",", ".");
  }
  const value = Number(normalised);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}
