import type { Messages } from "../../types";

/** English translations for the "stock" module. Must mirror ../pt/stock.ts. */
const stock: Messages["stock"] = {
  title: "Stock",
  eyebrow: "Management",
  description: "{count} items · clinical and operational supplies",
  actions: "Actions",
  newItem: "New item",
  newItemTitle: "New stock item",
  editItem: "Edit item",
  editItemDescription: "Update the stock item.",

  fields: {
    name: "Item",
    namePlaceholder: "E.g. Nitrile gloves size M",
    sku: "SKU",
    category: "Category",
    unit: "Unit",
    unitPlaceholder: "box",
    currentStock: "Current stock",
    minStock: "Minimum stock",
    unitCost: "Unit cost",
  },

  filters: {
    search: "Search",
    searchPlaceholder: "Item or SKU…",
    category: "Category",
    status: "Status",
    ok: "OK",
    low: "Low stock",
    out: "Out of stock",
    expiring: "Expiring",
  },

  alerts: {
    title: "Stock alerts ({count})",
    outOfStock: "{name} is out of stock.",
    belowMin: "{name} is below minimum stock ({current}/{min}).",
    expires: "{name} expires in {days} days.",
    runningOut: "{name} is expected to run out in ~{days} days at the current rate.",
  },

  columns: {
    item: "Item",
    sku: "SKU",
    category: "Category",
    stock: "Stock",
    min: "Minimum",
    unitCost: "Unit cost",
    expiry: "Expiry",
    status: "Status",
  },
  status: { out: "Out of stock", low: "Low", expiring: "Expiring", ok: "OK" },
  empty: "No items match the filters.",

  movements: {
    title: "Recent movements",
    empty: "No movements recorded yet.",
    columns: { date: "Date", item: "Item", type: "Type", quantity: "Quantity", reason: "Reason" },
  },
  movementType: { ENTRADA: "In", SAIDA: "Out", AJUSTE: "Adjustment", PERDA: "Loss" },

  movement: {
    button: "Record movement",
    rowButton: "Move",
    rowTitle: "Move {name}",
    title: "Stock movement",
    description: "Record usage, manual stock-ins, inventory adjustments or losses.",
    submit: "Record",
    item: "Item",
    select: "Select…",
    type: "Type",
    countedStock: "Counted stock",
    quantity: "Quantity",
    reason: "Reason",
    reasonPlaceholderOut: "E.g. used in consultations",
    reasonPlaceholderOther: "E.g. monthly count",
    projected: "Stock after movement",
    toast: "Stock movement recorded",
    types: {
      SAIDA: "Out (usage)",
      ENTRADA: "Manual stock-in",
      AJUSTE: "Inventory adjustment",
      PERDA: "Loss / breakage",
    },
    errors: {
      itemRequired: "Select the item.",
      quantityPositive: "Enter a quantity greater than zero.",
      noPermission: "You do not have permission to move stock.",
      itemNotFound: "Item not found.",
      insufficient: "Insufficient stock: only {stock} {unit} available.",
    },
  },
};

export default stock;
