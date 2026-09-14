"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { applyMovement, movingAverageCost } from "@/lib/domain/stock";
import { getTranslator } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";

export interface InventoryContext {
  suppliers: { id: string; name: string }[];
  items: { id: string; name: string; sku: string; unit: string; currentStock: number; lastCost: number }[];
}

export async function getInventoryContext(): Promise<InventoryContext> {
  const user = await requireUser();
  const [suppliers, items] = await Promise.all([
    prisma.supplier.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.inventoryItem.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, unit: true, currentStock: true, purchasePrice: true },
    }),
  ]);
  return {
    suppliers,
    items: items.map((i) => ({
      id: i.id, name: i.name, sku: i.sku, unit: i.unit,
      currentStock: i.currentStock, lastCost: i.purchasePrice,
    })),
  };
}

function purchaseSchema(t: Translator) {
  return z.object({
    supplierId: z.string().min(1, t("suppliers.newPurchase.errors.supplierRequired")),
    invoiceNumber: z.string().optional(),
    notes: z.string().optional(),
    received: z.boolean().default(true),
    paid: z.boolean().default(false),
    dueAt: z.string().optional(),
    items: z
      .array(
        z.object({
          itemId: z.string().min(1),
          quantity: z.number().int().positive(t("suppliers.newPurchase.errors.quantityPositive")),
          unitCost: z.number().int().nonnegative(),
        }),
      )
      .min(1, t("suppliers.newPurchase.errors.itemsRequired")),
  });
}

export type PurchaseInput = z.input<ReturnType<typeof purchaseSchema>>;

/**
 * Register a purchase. When marked as received, it atomically:
 *  - creates the purchase + its lines,
 *  - writes an ENTRADA stock movement per line,
 *  - increases each item's stock and recomputes its moving-average cost,
 *  - books the matching expense (Contas a pagar / paga).
 */
export async function createPurchase(input: PurchaseInput) {
  const user = await requireUser();
  const t = await getTranslator();
  if (!can(user.role, "supplier.manage")) return { error: t("suppliers.newPurchase.errors.noPermission") };

  const parsed = purchaseSchema(t).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  const supplier = await prisma.supplier.findFirst({
    where: { id: data.supplierId, clinicId: user.clinicId },
    select: { id: true, name: true },
  });
  if (!supplier) return { error: t("suppliers.newPurchase.errors.supplierNotFound") };

  const itemIds = data.items.map((i) => i.itemId);
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: itemIds }, clinicId: user.clinicId },
    select: { id: true, currentStock: true, avgCost: true },
  });
  if (items.length !== new Set(itemIds).size) return { error: t("suppliers.newPurchase.errors.invalidItem") };
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const total = data.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const now = new Date();
  const dueAt = data.dueAt ? new Date(data.dueAt) : null;

  const purchaseId = await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        clinicId: user.clinicId,
        supplierId: supplier.id,
        invoiceNumber: data.invoiceNumber?.trim() || null,
        notes: data.notes?.trim() || null,
        status: data.received ? "RECEBIDA" : "ENCOMENDADA",
        paymentStatus: data.paid ? "PAGO" : "PENDENTE",
        total,
        orderedAt: now,
        receivedAt: data.received ? now : null,
        dueAt,
        items: {
          create: data.items.map((i) => ({
            itemId: i.itemId,
            quantity: i.quantity,
            unitCost: i.unitCost,
            total: i.quantity * i.unitCost,
          })),
        },
      },
      select: { id: true },
    });

    if (data.received) {
      for (const line of data.items) {
        const current = itemMap.get(line.itemId)!;
        const newStock = current.currentStock + line.quantity;
        const avgCost = movingAverageCost(current.currentStock, current.avgCost, line.quantity, line.unitCost);

        await tx.inventoryMovement.create({
          data: {
            clinicId: user.clinicId,
            itemId: line.itemId,
            type: "ENTRADA",
            quantity: line.quantity,
            unitCost: line.unitCost,
            // Texto guardado na base de dados (não se traduz).
            reason: `Receção de compra${data.invoiceNumber ? ` · ${data.invoiceNumber}` : ""}`,
            purchaseId: purchase.id,
          },
        });
        await tx.inventoryItem.update({
          where: { id: line.itemId },
          data: {
            currentStock: newStock,
            avgCost,
            purchasePrice: line.unitCost,
            lastPurchaseAt: now,
            supplierId: supplier.id,
          },
        });
      }

      // Book the cost so it shows up in Financeiro / contas a pagar.
      const category = await tx.expenseCategory.findFirst({
        where: { clinicId: user.clinicId, name: "Material clínico" },
        select: { id: true },
      });
      await tx.expense.create({
        data: {
          clinicId: user.clinicId,
          categoryId: category?.id ?? null,
          supplierId: supplier.id,
          purchaseId: purchase.id,
          description: `Compra a ${supplier.name}${data.invoiceNumber ? ` · ${data.invoiceNumber}` : ""}`,
          amount: total,
          status: data.paid ? "PAGA" : "PENDENTE",
          incurredAt: now,
          dueAt,
        },
      });
    }

    return purchase.id;
  });

  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    action: "purchase.create",
    entity: "Purchase",
    entityId: purchaseId,
    metadata: { supplierId: supplier.id, total, received: data.received, lines: data.items.length },
  });

  revalidatePath("/fornecedores");
  revalidatePath("/stock");
  revalidatePath("/financeiro");
  return { ok: true as const, id: purchaseId };
}

function movementSchema(t: Translator) {
  return z.object({
    itemId: z.string().min(1, t("stock.movement.errors.itemRequired")),
    type: z.enum(["ENTRADA", "SAIDA", "AJUSTE", "PERDA"]),
    quantity: z.number().int().positive(t("stock.movement.errors.quantityPositive")),
    reason: z.string().optional(),
  });
}

export type StockMovementInput = z.input<ReturnType<typeof movementSchema>>;

/**
 * Register a stock movement and keep `currentStock` consistent.
 *  ENTRADA  -> adds       SAIDA / PERDA -> subtracts (never below zero)
 *  AJUSTE   -> sets the counted stock; the signed difference is recorded.
 */
export async function registerStockMovement(input: StockMovementInput) {
  const user = await requireUser();
  const t = await getTranslator();
  if (!can(user.role, "inventory.manage")) return { error: t("stock.movement.errors.noPermission") };

  const parsed = movementSchema(t).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { itemId, type, quantity, reason } = parsed.data;

  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, clinicId: user.clinicId },
    select: { id: true, name: true, currentStock: true, avgCost: true, unit: true },
  });
  if (!item) return { error: t("stock.movement.errors.itemNotFound") };

  const outcome = applyMovement(item.currentStock, type, quantity);
  if ("error" in outcome) {
    return {
      error:
        outcome.code === "insufficient_stock"
          ? t("stock.movement.errors.insufficient", { stock: item.currentStock, unit: item.unit })
          : t("stock.movement.errors.quantityPositive"),
    };
  }
  const { delta, newStock } = outcome;

  await prisma.$transaction([
    prisma.inventoryMovement.create({
      data: {
        clinicId: user.clinicId,
        itemId: item.id,
        type,
        quantity: delta,
        unitCost: item.avgCost,
        reason: reason?.trim() || null,
      },
    }),
    prisma.inventoryItem.update({ where: { id: item.id }, data: { currentStock: newStock } }),
  ]);

  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    action: `inventory.${type.toLowerCase()}`,
    entity: "InventoryItem",
    entityId: item.id,
    metadata: { delta, from: item.currentStock, to: newStock },
  });

  revalidatePath("/stock");
  return { ok: true as const };
}
