export interface DistributionSummary {
  count: number;
  mean: number;
  median: number;
  mode: number | null;
  standardDeviation: number;
  interquartileRange: number;
  coefficientOfVariation: number;
  min: number;
  max: number;
  p90: number;
  p95: number;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower + 1] === undefined
    ? sorted[lower]
    : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

export function summarizeDistribution(values: number[]): DistributionSummary {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) {
    return {
      count: 0, mean: 0, median: 0, mode: null, standardDeviation: 0,
      interquartileRange: 0, coefficientOfVariation: 0, min: 0, max: 0, p90: 0, p95: 0,
    };
  }

  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;
  const frequencies = new Map<number, number>();
  for (const value of finite) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  const highestFrequency = Math.max(...frequencies.values());
  const modes = [...frequencies.entries()].filter(([, count]) => count === highestFrequency);

  return {
    count: finite.length,
    mean: round(mean),
    median: round(percentile(finite, 0.5)),
    mode: highestFrequency > 1 && modes.length === 1 ? modes[0][0] : null,
    standardDeviation: round(Math.sqrt(variance)),
    interquartileRange: round(percentile(finite, 0.75) - percentile(finite, 0.25)),
    coefficientOfVariation: mean === 0 ? 0 : round((Math.sqrt(variance) / Math.abs(mean)) * 100),
    min: Math.min(...finite),
    max: Math.max(...finite),
    p90: round(percentile(finite, 0.9)),
    p95: round(percentile(finite, 0.95)),
  };
}

/** Wilson score interval for a binomial proportion, returned as percentages. */
export function proportionConfidenceInterval(successes: number, total: number) {
  if (total <= 0) return { low: 0, high: 0 };
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z ** 2) / total;
  const centre = (p + (z ** 2) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + (z ** 2) / (4 * total)) / total)) / denominator;
  return { low: round(Math.max(0, centre - margin) * 100), high: round(Math.min(1, centre + margin) * 100) };
}

export function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? round((numerator / denominator) * 100) : 0;
}
