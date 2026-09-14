// Stock arithmetic — pure functions shared by the inventory server actions.

export type MovementType = "ENTRADA" | "SAIDA" | "AJUSTE" | "PERDA";

/** Motivo de recusa, para quem chama traduzir a mensagem. */
export type MovementErrorCode = "invalid_quantity" | "insufficient_stock";

/**
 * Resulting stock and the signed delta recorded on the movement.
 *  ENTRADA adds, SAIDA/PERDA subtract, AJUSTE sets the counted quantity.
 * Returns an error (Portuguese message + `code`) when the quantity is invalid
 * or a withdrawal exceeds what is in stock.
 */
export function applyMovement(
  currentStock: number,
  type: MovementType,
  quantity: number,
): { delta: number; newStock: number } | { error: string; code: MovementErrorCode } {
  if (quantity <= 0) return { error: "Indique uma quantidade maior que zero.", code: "invalid_quantity" };

  if (type === "ENTRADA") return { delta: quantity, newStock: currentStock + quantity };
  if (type === "AJUSTE") return { delta: quantity - currentStock, newStock: quantity };

  if (quantity > currentStock) return { error: "Stock insuficiente.", code: "insufficient_stock" };
  return { delta: -quantity, newStock: currentStock - quantity };
}

/** Moving-average unit cost after receiving `quantity` units at `unitCost`. */
export function movingAverageCost(
  currentStock: number,
  currentAvgCost: number,
  quantity: number,
  unitCost: number,
): number {
  const newStock = currentStock + quantity;
  if (newStock <= 0) return unitCost;
  return Math.round((currentStock * currentAvgCost + quantity * unitCost) / newStock);
}
