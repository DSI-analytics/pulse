/**
 * Cor de barras distribuída pela posição na série.
 *
 * A primeira barra usa a cor base a 100%; as seguintes recebem níveis uniformes
 * de intensidade, misturando a cor base (em OKLCH, sem mudar de tom) com a
 * superfície do cartão.
 *
 * A escala usa a quantidade de barras, não os valores. Assim, todas as barras
 * têm tonalidades diferentes mesmo quando os valores são iguais ou próximos.
 */

export const BAR_MIN_STRENGTH = 45;

/** Força da cor (45–100) distribuída uniformemente entre todas as barras. */
export function barStrength(index: number, count: number): number {
  if (!Number.isFinite(index) || !Number.isInteger(count) || count <= 0) return BAR_MIN_STRENGTH;
  if (count === 1) return 100;
  const position = Math.min(count - 1, Math.max(0, index));
  const ratio = 1 - position / (count - 1);
  return Number((BAR_MIN_STRENGTH + (100 - BAR_MIN_STRENGTH) * ratio).toFixed(2));
}

/** Cor CSS da barra: `color-mix` em OKLCH entre a cor base e o cartão. */
export function barColor(index: number, count: number, base = "var(--primary)"): string {
  const strength = barStrength(index, count);
  return strength >= 100 ? base : `color-mix(in oklch, ${base} ${strength}%, var(--card))`;
}
