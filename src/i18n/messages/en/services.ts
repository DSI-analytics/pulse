import type { Messages } from "../../types";

/** English translations for the "services" module. Must mirror ../pt/services.ts. */
const services: Messages["services"] = {
  title: "Services and Exams",
  description: "{count} services · clinic price list",
  newService: "New service",
  newServiceTitle: "New service or exam",
  newServiceDescription: "Becomes available for booking and sets the price charged.",
  editTitle: "Edit service",
  editDescription: "Update the service or exam details.",
  fields: {
    name: "Name",
    namePlaceholder: "E.g. Full blood count",
    type: "Type",
    category: "Category",
    categoryDefault: "Clinical tests",
    categoryPlaceholder: "E.g. Imaging",
    price: "Price",
  },
  searchPlaceholder: "Service or exam name…",
  sources: {
    CONSULTA: "Consultation",
    EXAME: "Exam",
    PROCEDIMENTO: "Procedure",
    PRODUTO: "Product",
    SEGURADORA: "Insurer",
    PRIVADO: "Private",
    OUTRO: "Other",
  },
  emptyTitle: "No services registered",
  emptyDescription: "Register the clinic's exams and procedures so they can be booked and invoiced.",
  columns: {
    service: "Service",
    category: "Category",
    type: "Type",
    appointments: "Appointments",
    price: "Price",
  },
};

export default services;
