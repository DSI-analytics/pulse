"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { parseMoneyInput } from "@/lib/format";
import { getTranslator } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";
import type { PatientProfileValues } from "@/server/patient-data";
import { createPatientProfile, updatePatientProfile } from "@/server/patient-registry";

type Values = Record<string, string>;
type Result = { ok: true; id?: string } | { error: string };

async function guard(permission: Permission): Promise<{ clinicId: string; userId: string; t: Translator } | { error: string }> {
  const user = await requireUser();
  const t = await getTranslator();
  if (!can(user.role, permission)) return { error: t("catalog.errors.noPermission") };
  return { clinicId: user.clinicId, userId: user.userId, t };
}

/** Cor predefinida das especialidades (OKLCH, igual à paleta das Configurações). */
const DEFAULT_SPECIALTY_COLOR = "oklch(55% 0.11 182)";

const nonEmpty = (v?: string) => (v ?? "").trim();

// ── Patient ──────────────────────────────────────────────────────────────
// O cadastro vive em src/server/patient-registry.ts (detecção de duplicados,
// perfil alargado, documentos, fusão). Estas funções mantêm-se como a API
// usada pelos formulários existentes e delegam nesse serviço — sem duplicar
// regras de validação nem de auditoria.

export async function createPatientRecord(values: Values): Promise<Result> {
  const result = await createPatientProfile(values as PatientProfileValues);
  return "error" in result ? result : { ok: true, id: result.id };
}

export async function updatePatientRecord(patientId: string, values: Values): Promise<Result> {
  const result = await updatePatientProfile(patientId, values as PatientProfileValues);
  return "error" in result ? result : { ok: true, id: result.id };
}

/**
 * Inactiva o paciente (§36 — nunca DELETE físico de dados clínicos).
 *
 * O histórico clínico, as marcações e a facturação permanecem intactos e
 * auditáveis; o registo deixa de aparecer nas listas e na pesquisa. Para
 * consolidar dois registos da mesma pessoa use `mergePatients`.
 */
export async function deletePatientRecord(patientId: string): Promise<Result> {
  const g = await guard("patient.manage");
  if ("error" in g) return g;

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: g.clinicId },
    select: { id: true, code: true, name: true, isActive: true },
  });
  if (!patient) return { error: g.t("catalog.errors.patientNotFound") };
  if (!patient.isActive) return { error: g.t("catalog.errors.patientAlreadyInactive") };

  const upcoming = await prisma.appointment.count({
    where: { clinicId: g.clinicId, patientId: patient.id, startAt: { gte: new Date() }, status: { in: ["MARCADA", "CONFIRMADA", "CHEGOU", "EM_ESPERA", "EM_CONSULTA"] } },
  });
  if (upcoming > 0) return { error: g.t("catalog.errors.patientUpcoming") };

  await prisma.patient.update({
    where: { id: patient.id },
    data: { isActive: false, deactivatedAt: new Date(), version: { increment: 1 } },
  });

  await audit({
    clinicId: g.clinicId,
    userId: g.userId,
    action: "patient.deactivate",
    entity: "Patient",
    entityId: patient.id,
    before: { isActive: true },
    after: { isActive: false },
    metadata: { code: patient.code },
  });
  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
  redirect("/pacientes");
}

// ── Specialty ────────────────────────────────────────────────────────────
export async function createSpecialtyRecord(values: Values): Promise<Result> {
  const g = await guard("doctor.manage");
  if ("error" in g) return g;
  const name = nonEmpty(values.name);
  if (name.length < 2) return { error: g.t("catalog.errors.specialtyName") };
  const exists = await prisma.specialty.findFirst({ where: { clinicId: g.clinicId, name } });
  if (exists) return { error: g.t("catalog.errors.specialtyDuplicate") };
  const s = await prisma.specialty.create({
    data: { clinicId: g.clinicId, name, color: nonEmpty(values.color) || DEFAULT_SPECIALTY_COLOR },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "specialty.create", entity: "Specialty", entityId: s.id });
  revalidatePath("/medicos");
  revalidatePath("/configuracoes");
  return { ok: true, id: s.id };
}

export async function updateSpecialtyRecord(id: string, values: Values): Promise<Result> {
  const g = await guard("doctor.manage");
  if ("error" in g) return g;
  const name = nonEmpty(values.name);
  if (name.length < 2) return { error: g.t("catalog.errors.specialtyName") };
  const existing = await prisma.specialty.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.specialtyNotFound") };
  const dup = await prisma.specialty.findFirst({ where: { clinicId: g.clinicId, name, NOT: { id } } });
  if (dup) return { error: g.t("catalog.errors.specialtyDuplicate") };
  const updated = await prisma.specialty.update({
    where: { id: existing.id },
    data: { name, color: nonEmpty(values.color) || DEFAULT_SPECIALTY_COLOR },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "specialty.update", entity: "Specialty", entityId: updated.id });
  revalidatePath("/medicos");
  revalidatePath("/configuracoes");
  return { ok: true, id: updated.id };
}

export async function deleteSpecialtyRecord(id: string): Promise<Result> {
  const g = await guard("doctor.manage");
  if ("error" in g) return g;
  const existing = await prisma.specialty.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.specialtyNotFound") };
  const doctorCount = await prisma.doctor.count({ where: { clinicId: g.clinicId, specialtyId: id } });
  if (doctorCount > 0) return { error: g.t("catalog.errors.specialtyInUse") };
  await prisma.specialty.delete({ where: { id: existing.id } });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "specialty.delete", entity: "Specialty", entityId: existing.id });
  revalidatePath("/medicos");
  revalidatePath("/configuracoes");
  return { ok: true, id: existing.id };
}

// ── Doctor ───────────────────────────────────────────────────────────────
export async function createDoctorRecord(values: Values): Promise<Result> {
  const g = await guard("doctor.manage");
  if ("error" in g) return g;
  const name = nonEmpty(values.name);
  if (name.length < 3) return { error: g.t("catalog.errors.doctorName") };
  if (!nonEmpty(values.specialtyId)) return { error: g.t("catalog.errors.specialtyRequired") };
  const spec = await prisma.specialty.findFirst({ where: { id: values.specialtyId, clinicId: g.clinicId } });
  if (!spec) return { error: g.t("catalog.errors.specialtyInvalid") };
  const parsedPrice = parseMoneyInput(values.consultationPrice || "0");
  if (parsedPrice === null) return { error: g.t("catalog.errors.invalidPrice") };
  const price = parsedPrice || 150000;
  const duration = Number.parseInt(values.consultationDuration || "30", 10) || 30;

  const d = await prisma.doctor.create({
    data: {
      clinicId: g.clinicId,
      specialtyId: spec.id,
      name,
      consultationPrice: price,
      consultationDuration: duration,
      phone: nonEmpty(values.phone) || null,
      email: nonEmpty(values.email) || null,
      licenseNumber: nonEmpty(values.licenseNumber) || null,
    },
    select: { id: true },
  });
  // Default Mon–Fri 08:00–16:00 with lunch break.
  await prisma.doctorSchedule.createMany({
    data: [1, 2, 3, 4, 5].map((weekday) => ({
      doctorId: d.id, weekday, startTime: "08:00", endTime: "16:00",
      breakStart: "12:30", breakEnd: "13:30", slotMinutes: duration,
    })),
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "doctor.create", entity: "Doctor", entityId: d.id });
  revalidatePath("/medicos");
  return { ok: true, id: d.id };
}

export async function updateDoctorRecord(id: string, values: Values): Promise<Result> {
  const g = await guard("doctor.manage");
  if ("error" in g) return g;
  const existing = await prisma.doctor.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.doctorNotFound") };
  const name = nonEmpty(values.name);
  if (name.length < 3) return { error: g.t("catalog.errors.doctorName") };
  if (!nonEmpty(values.specialtyId)) return { error: g.t("catalog.errors.specialtyRequired") };
  const spec = await prisma.specialty.findFirst({ where: { id: values.specialtyId, clinicId: g.clinicId } });
  if (!spec) return { error: g.t("catalog.errors.specialtyInvalid") };
  const parsedPrice = parseMoneyInput(values.consultationPrice || "0");
  if (parsedPrice === null) return { error: g.t("catalog.errors.invalidPrice") };
  const price = parsedPrice || 150000;
  const duration = Number.parseInt(values.consultationDuration || "30", 10) || 30;
  const updated = await prisma.doctor.update({
    where: { id: existing.id },
    data: {
      name,
      specialtyId: spec.id,
      consultationPrice: price,
      consultationDuration: duration,
      phone: nonEmpty(values.phone) || null,
      email: nonEmpty(values.email) || null,
      licenseNumber: nonEmpty(values.licenseNumber) || null,
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "doctor.update", entity: "Doctor", entityId: updated.id });
  revalidatePath("/medicos");
  return { ok: true, id: updated.id };
}

export async function deleteDoctorRecord(id: string): Promise<Result> {
  const g = await guard("doctor.manage");
  if ("error" in g) return g;
  const existing = await prisma.doctor.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.doctorNotFound") };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.revenue.deleteMany({ where: { clinicId: g.clinicId, doctorId: existing.id } });
      await tx.appointment.deleteMany({ where: { clinicId: g.clinicId, doctorId: existing.id } });
      await tx.doctorAvailabilityException.deleteMany({ where: { doctorId: existing.id } });
      await tx.doctorSchedule.deleteMany({ where: { doctorId: existing.id } });
      await tx.doctorHealthPlan.deleteMany({ where: { doctorId: existing.id } });
      await tx.doctor.delete({ where: { id: existing.id, clinicId: g.clinicId } });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : g.t("catalog.errors.doctorDeleteFailed");
    return { error: message };
  }

  await audit({ clinicId: g.clinicId, userId: g.userId, action: "doctor.delete", entity: "Doctor", entityId: existing.id });
  revalidatePath("/medicos");
  revalidatePath(`/medicos/${id}`);
  return { ok: true, id: existing.id };
}

// ── Supplier ─────────────────────────────────────────────────────────────
export async function createSupplierRecord(values: Values): Promise<Result> {
  const g = await guard("supplier.manage");
  if ("error" in g) return g;
  const name = nonEmpty(values.name);
  if (name.length < 2) return { error: g.t("catalog.errors.supplierName") };
  const s = await prisma.supplier.create({
    data: {
      clinicId: g.clinicId, name,
      category: nonEmpty(values.category) || null,
      contactName: nonEmpty(values.contactName) || null,
      phone: nonEmpty(values.phone) || null,
      email: nonEmpty(values.email) || null,
      paymentTerms: nonEmpty(values.paymentTerms) || null,
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "supplier.create", entity: "Supplier", entityId: s.id });
  revalidatePath("/fornecedores");
  return { ok: true, id: s.id };
}

export async function updateSupplierRecord(id: string, values: Values): Promise<Result> {
  const g = await guard("supplier.manage");
  if ("error" in g) return g;
  const name = nonEmpty(values.name);
  if (name.length < 2) return { error: g.t("catalog.errors.supplierName") };
  const existing = await prisma.supplier.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.supplierNotFound") };
  const updated = await prisma.supplier.update({
    where: { id: existing.id },
    data: {
      name,
      category: nonEmpty(values.category) || null,
      contactName: nonEmpty(values.contactName) || null,
      phone: nonEmpty(values.phone) || null,
      email: nonEmpty(values.email) || null,
      paymentTerms: nonEmpty(values.paymentTerms) || null,
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "supplier.update", entity: "Supplier", entityId: updated.id });
  revalidatePath("/fornecedores");
  return { ok: true, id: updated.id };
}

export async function deleteSupplierRecord(id: string): Promise<Result> {
  const g = await guard("supplier.manage");
  if ("error" in g) return g;
  const existing = await prisma.supplier.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.supplierNotFound") };
  const purchaseCount = await prisma.purchase.count({ where: { clinicId: g.clinicId, supplierId: id } });
  const itemCount = await prisma.inventoryItem.count({ where: { clinicId: g.clinicId, supplierId: id } });
  if (purchaseCount > 0 || itemCount > 0) return { error: g.t("catalog.errors.supplierInUse") };
  await prisma.supplier.delete({ where: { id: existing.id } });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "supplier.delete", entity: "Supplier", entityId: existing.id });
  revalidatePath("/fornecedores");
  return { ok: true, id: existing.id };
}

// ── Health plan ──────────────────────────────────────────────────────────
export async function createHealthPlanRecord(values: Values): Promise<Result> {
  const g = await guard("healthplan.manage");
  if ("error" in g) return g;
  if (!nonEmpty(values.insuranceCompanyId)) return { error: g.t("catalog.errors.insurerRequired") };
  const name = nonEmpty(values.name);
  if (name.length < 2) return { error: g.t("catalog.errors.planName") };
  const insurer = await prisma.healthInsuranceCompany.findFirst({ where: { id: values.insuranceCompanyId, clinicId: g.clinicId } });
  if (!insurer) return { error: g.t("catalog.errors.insurerInvalid") };
  const contractPrice = parseMoneyInput(values.contractPrice || "0");
  const patientCopay = parseMoneyInput(values.patientCopay || "0");
  if (contractPrice === null || patientCopay === null) return { error: g.t("catalog.errors.invalidPrice") };
  const p = await prisma.healthPlan.create({
    data: {
      clinicId: g.clinicId,
      insuranceCompanyId: insurer.id,
      name,
      contractPrice,
      patientCopay,
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "healthplan.create", entity: "HealthPlan", entityId: p.id });
  revalidatePath("/planos");
  return { ok: true, id: p.id };
}

export async function updateHealthPlanRecord(id: string, values: Values): Promise<Result> {
  const g = await guard("healthplan.manage");
  if ("error" in g) return g;
  const existing = await prisma.healthPlan.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.planNotFound") };
  if (!nonEmpty(values.insuranceCompanyId)) return { error: g.t("catalog.errors.insurerRequired") };
  const insurer = await prisma.healthInsuranceCompany.findFirst({ where: { id: values.insuranceCompanyId, clinicId: g.clinicId } });
  if (!insurer) return { error: g.t("catalog.errors.insurerInvalid") };
  const name = nonEmpty(values.name);
  if (name.length < 2) return { error: g.t("catalog.errors.planName") };
  const contractPrice = parseMoneyInput(values.contractPrice || "0");
  const patientCopay = parseMoneyInput(values.patientCopay || "0");
  if (contractPrice === null || patientCopay === null) return { error: g.t("catalog.errors.invalidPrice") };
  const updated = await prisma.healthPlan.update({
    where: { id: existing.id },
    data: {
      insuranceCompanyId: insurer.id,
      name,
      contractPrice,
      patientCopay,
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "healthplan.update", entity: "HealthPlan", entityId: updated.id });
  revalidatePath("/planos");
  return { ok: true, id: updated.id };
}

export async function deleteHealthPlanRecord(id: string): Promise<Result> {
  const g = await guard("healthplan.manage");
  if ("error" in g) return g;
  const existing = await prisma.healthPlan.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.planNotFound") };
  const linkCount = await prisma.patientHealthPlan.count({ where: { clinicId: g.clinicId, healthPlanId: id } });
  const appointmentCount = await prisma.appointment.count({ where: { clinicId: g.clinicId, healthPlanId: id } });
  if (linkCount > 0 || appointmentCount > 0) return { error: g.t("catalog.errors.planInUse") };
  await prisma.healthPlan.delete({ where: { id: existing.id } });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "healthplan.delete", entity: "HealthPlan", entityId: existing.id });
  revalidatePath("/planos");
  return { ok: true, id: existing.id };
}

// ── Inventory item ───────────────────────────────────────────────────────
export async function createInventoryItemRecord(values: Values): Promise<Result> {
  const g = await guard("inventory.manage");
  if ("error" in g) return g;
  const name = nonEmpty(values.name);
  const sku = nonEmpty(values.sku);
  if (name.length < 2) return { error: g.t("catalog.errors.itemName") };
  if (sku.length < 1) return { error: g.t("catalog.errors.skuRequired") };
  const dup = await prisma.inventoryItem.findFirst({ where: { clinicId: g.clinicId, sku } });
  if (dup) return { error: g.t("catalog.errors.skuDuplicate") };
  const cost = parseMoneyInput(values.purchasePrice || "0");
  if (cost === null) return { error: g.t("catalog.errors.invalidPrice") };
  const item = await prisma.inventoryItem.create({
    data: {
      clinicId: g.clinicId,
      name, sku,
      categoryId: nonEmpty(values.categoryId) || null,
      unit: nonEmpty(values.unit) || "un",
      currentStock: Number.parseInt(values.currentStock || "0", 10) || 0,
      minStock: Number.parseInt(values.minStock || "0", 10) || 0,
      purchasePrice: cost,
      avgCost: cost,
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "inventory.create", entity: "InventoryItem", entityId: item.id });
  revalidatePath("/stock");
  return { ok: true, id: item.id };
}

export async function updateInventoryItemRecord(id: string, values: Values): Promise<Result> {
  const g = await guard("inventory.manage");
  if ("error" in g) return g;
  const existing = await prisma.inventoryItem.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.itemNotFound") };
  const name = nonEmpty(values.name);
  const sku = nonEmpty(values.sku);
  if (name.length < 2) return { error: g.t("catalog.errors.itemName") };
  if (sku.length < 1) return { error: g.t("catalog.errors.skuRequired") };
  const dup = await prisma.inventoryItem.findFirst({ where: { clinicId: g.clinicId, sku, NOT: { id } } });
  if (dup) return { error: g.t("catalog.errors.skuDuplicate") };
  const cost = parseMoneyInput(values.purchasePrice || "0");
  if (cost === null) return { error: g.t("catalog.errors.invalidPrice") };
  const updated = await prisma.inventoryItem.update({
    where: { id: existing.id },
    data: {
      name,
      sku,
      categoryId: nonEmpty(values.categoryId) || null,
      unit: nonEmpty(values.unit) || "un",
      currentStock: Number.parseInt(values.currentStock || "0", 10) || 0,
      minStock: Number.parseInt(values.minStock || "0", 10) || 0,
      purchasePrice: cost,
      avgCost: cost,
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "inventory.update", entity: "InventoryItem", entityId: updated.id });
  revalidatePath("/stock");
  return { ok: true, id: updated.id };
}

export async function deleteInventoryItemRecord(id: string): Promise<Result> {
  const g = await guard("inventory.manage");
  if ("error" in g) return g;
  const existing = await prisma.inventoryItem.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.itemNotFound") };
  const movementCount = await prisma.inventoryMovement.count({ where: { clinicId: g.clinicId, itemId: id } });
  const purchaseItemCount = await prisma.purchaseItem.count({ where: { itemId: id } });
  if (movementCount > 0 || purchaseItemCount > 0) return { error: g.t("catalog.errors.itemInUse") };
  await prisma.inventoryItem.delete({ where: { id: existing.id } });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "inventory.delete", entity: "InventoryItem", entityId: existing.id });
  revalidatePath("/stock");
  return { ok: true, id: existing.id };
}

// ── Service / exam ───────────────────────────────────────────────────────
export async function createServiceRecord(values: Values): Promise<Result> {
  const g = await guard("service.manage");
  if ("error" in g) return g;
  const name = nonEmpty(values.name);
  if (name.length < 2) return { error: g.t("catalog.errors.serviceName") };
  const dup = await prisma.service.findFirst({ where: { clinicId: g.clinicId, name } });
  if (dup) return { error: g.t("catalog.errors.serviceDuplicate") };
  const price = parseMoneyInput(values.basePrice || "0");
  if (price === null || price <= 0) return { error: g.t("catalog.errors.invalidPrice") };
  const source = ["CONSULTA", "EXAME", "PROCEDIMENTO", "PRODUTO", "OUTRO"].includes(values.source)
    ? (values.source as never)
    : ("EXAME" as never);

  const s = await prisma.service.create({
    data: {
      clinicId: g.clinicId,
      name,
      category: nonEmpty(values.category) || "Exame",
      source,
      basePrice: price,
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "service.create", entity: "Service", entityId: s.id });
  revalidatePath("/servicos");
  return { ok: true, id: s.id };
}

export async function updateServiceRecord(id: string, values: Values): Promise<Result> {
  const g = await guard("service.manage");
  if ("error" in g) return g;
  const existing = await prisma.service.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.serviceNotFound") };
  const name = nonEmpty(values.name);
  if (name.length < 2) return { error: g.t("catalog.errors.serviceName") };
  const dup = await prisma.service.findFirst({ where: { clinicId: g.clinicId, name, NOT: { id } } });
  if (dup) return { error: g.t("catalog.errors.serviceDuplicate") };
  const price = parseMoneyInput(values.basePrice || "0");
  if (price === null || price <= 0) return { error: g.t("catalog.errors.invalidPrice") };
  const source = ["CONSULTA", "EXAME", "PROCEDIMENTO", "PRODUTO", "OUTRO"].includes(values.source)
    ? (values.source as never)
    : ("EXAME" as never);
  const updated = await prisma.service.update({
    where: { id: existing.id },
    data: {
      name,
      category: nonEmpty(values.category) || "Exame",
      source,
      basePrice: price,
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "service.update", entity: "Service", entityId: updated.id });
  revalidatePath("/servicos");
  return { ok: true, id: updated.id };
}

export async function deleteServiceRecord(id: string): Promise<Result> {
  const g = await guard("service.manage");
  if ("error" in g) return g;
  const existing = await prisma.service.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.serviceNotFound") };
  const appointmentCount = await prisma.appointment.count({ where: { clinicId: g.clinicId, serviceId: id } });
  const invoiceItemCount = await prisma.invoiceItem.count({ where: { serviceId: id } });
  if (appointmentCount > 0 || invoiceItemCount > 0) return { error: g.t("catalog.errors.serviceInUse") };
  await prisma.service.delete({ where: { id: existing.id } });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "service.delete", entity: "Service", entityId: existing.id });
  revalidatePath("/servicos");
  return { ok: true, id: existing.id };
}

// ── Expense ──────────────────────────────────────────────────────────────
export async function createExpenseRecord(values: Values): Promise<Result> {
  const g = await guard("finance.manage");
  if ("error" in g) return g;
  const description = nonEmpty(values.description);
  if (description.length < 2) return { error: g.t("catalog.errors.expenseDescription") };
  const amount = parseMoneyInput(values.amount || "0");
  if (amount === null || amount <= 0) return { error: g.t("catalog.errors.invalidAmount") };
  const status = values.status === "PENDENTE" ? "PENDENTE" : "PAGA";
  const method = ["DINHEIRO", "MPESA", "EMOLA", "CARTAO", "TRANSFERENCIA"].includes(values.method) ? (values.method as never) : null;
  const e = await prisma.expense.create({
    data: {
      clinicId: g.clinicId,
      categoryId: nonEmpty(values.categoryId) || null,
      description, amount, status, method,
      incurredAt: values.incurredAt ? new Date(values.incurredAt) : new Date(),
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "expense.create", entity: "Expense", entityId: e.id });
  revalidatePath("/financeiro");
  return { ok: true, id: e.id };
}

export async function updateExpenseRecord(id: string, values: Values): Promise<Result> {
  const g = await guard("finance.manage");
  if ("error" in g) return g;
  const existing = await prisma.expense.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.expenseNotFound") };
  const description = nonEmpty(values.description);
  if (description.length < 2) return { error: g.t("catalog.errors.expenseDescription") };
  const amount = parseMoneyInput(values.amount || "0");
  if (amount === null || amount <= 0) return { error: g.t("catalog.errors.invalidAmount") };
  const status = values.status === "PENDENTE" ? "PENDENTE" : "PAGA";
  const method = ["DINHEIRO", "MPESA", "EMOLA", "CARTAO", "TRANSFERENCIA"].includes(values.method) ? (values.method as never) : null;
  const updated = await prisma.expense.update({
    where: { id: existing.id },
    data: {
      description,
      amount,
      status,
      method,
      categoryId: nonEmpty(values.categoryId) || null,
      incurredAt: values.incurredAt ? new Date(values.incurredAt) : new Date(),
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "expense.update", entity: "Expense", entityId: updated.id });
  revalidatePath("/financeiro");
  return { ok: true, id: updated.id };
}

export async function deleteExpenseRecord(id: string): Promise<Result> {
  const g = await guard("finance.manage");
  if ("error" in g) return g;
  const existing = await prisma.expense.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: g.t("catalog.errors.expenseNotFound") };
  await prisma.expense.delete({ where: { id: existing.id } });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "expense.delete", entity: "Expense", entityId: existing.id });
  revalidatePath("/financeiro");
  return { ok: true, id: existing.id };
}
