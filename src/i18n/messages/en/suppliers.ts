import type { Messages } from "../../types";

/** English translations for the "suppliers" module. Must mirror ../pt/suppliers.ts. */
const suppliers: Messages["suppliers"] = {
  title: "Suppliers",
  eyebrow: "Management",
  count: "{count} suppliers",
  actions: "Actions",
  new: "New supplier",
  edit: "Edit supplier",
  editDescription: "Update the supplier details.",

  fields: {
    name: "Name",
    category: "Category",
    categoryPlaceholder: "E.g. Medicines",
    contactName: "Contact person",
    phone: "Phone",
    email: "Email",
    paymentTerms: "Payment terms",
    paymentTermsPlaceholder: "30 days",
  },

  filters: {
    search: "Search",
    searchPlaceholder: "Supplier, contact or invoice…",
    category: "Category",
    debt: "Debt",
    withDebt: "With debt",
    purchaseStatus: "Purchase status",
    payment: "Payment",
  },
  filterOptions: {
    purchaseStatus: { ENCOMENDADA: "Ordered", RECEBIDA: "Received", PARCIAL: "Partial", CANCELADA: "Cancelled" },
    paymentStatus: { PENDENTE: "Pending", PARCIAL: "Partial", PAGO: "Paid" },
  },

  columns: {
    supplier: "Supplier",
    category: "Category",
    contact: "Contact",
    purchases: "Purchases",
    totalPurchased: "Total purchased",
    outstanding: "Owed",
    lastPurchase: "Last purchase",
  },
  empty: "No suppliers match the filters.",

  purchases: {
    title: "Recent purchases",
    empty: "No purchases recorded yet. Use “Record purchase” to add stock.",
    columns: {
      date: "Date",
      supplier: "Supplier",
      invoice: "Invoice",
      items: "Items",
      status: "Status",
      payment: "Payment",
      total: "Total",
    },
  },
  purchaseStatus: { RECEBIDA: "Received", ENCOMENDADA: "Ordered", PARCIAL: "Partial", CANCELADA: "Cancelled" },
  paymentStatus: { PAGO: "Paid", PARCIAL: "Partial", PENDENTE: "Pending" },

  newPurchase: {
    button: "Record purchase",
    title: "Record purchase",
    description: "When marked as received, stock is updated automatically and the expense is booked.",
    save: "Save purchase",
    supplier: "Supplier",
    select: "Select…",
    invoiceNumber: "Invoice no.",
    items: "Items",
    selectItem: "Select item…",
    quantityPlaceholder: "Qty",
    quantity: "Quantity",
    currentStock: "Current stock: {stock} {unit}",
    unitCostPlaceholder: "Unit cost",
    removeItem: "Remove item",
    addItem: "Add item",
    dueDate: "Due date",
    received: "Received (adds to stock)",
    paid: "Paid",
    total: "Purchase total",
    toastReceived: "Purchase recorded and stock updated",
    toastOrdered: "Order recorded",
    errors: {
      supplierRequired: "Select the supplier.",
      itemsRequired: "Add at least one item.",
      quantitiesPositive: "Quantities must be greater than zero.",
      quantityPositive: "Quantity must be greater than zero.",
      invalidUnitCost: "Enter a valid unit cost.",
      noPermission: "You do not have permission to record purchases.",
      supplierNotFound: "Supplier not found.",
      invalidItem: "Invalid item in the list.",
    },
  },
};

export default suppliers;
