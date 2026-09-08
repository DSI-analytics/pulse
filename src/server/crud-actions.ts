"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { parseMZN } from "@/lib/money";
import type { PatientProfileValues } from "@/server/patient-data";
import { createPatientProfile, updatePatientProfile } from "@/server/patient-registry";

type Values = Record<string, string>;
type Result = { ok: true; id?: string } | { error: string };

async function guard(permission: Permission): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const user = await requireUser();
  if (!can(user.role, permission)) return { error: "Sem permissão para esta operação." };
  return { clinicId: user.clinicId, userId: user.userId };
}

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
  if (!patient) return { error: "Paciente não encontrado." };
  if (!patient.isActive) return { error: "Este paciente já está inactivo." };

  const upcoming = await prisma.appointment.count({
    where: { clinicId: g.clinicId, patientId: patient.id, startAt: { gte: new Date() }, status: { in: ["MARCADA", "CONFIRMADA", "CHEGOU", "EM_ESPERA", "EM_CONSULTA"] } },
  });
  if (upcoming > 0) return { error: "Cancele primeiro as marcações futuras deste paciente." };

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
  if (name.length < 2) return { error: "Indique o nome da especialidade." };
  const exists = await prisma.specialty.findFirst({ where: { clinicId: g.clinicId, name } });
  if (exists) return { error: "Já existe uma especialidade com esse nome." };
  const s = await prisma.specialty.create({
    data: { clinicId: g.clinicId, name, color: nonEmpty(values.color) || "#0C7C74" },
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
  if (name.length < 2) return { error: "Indique o nome da especialidade." };
  const existing = await prisma.specialty.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: "Especialidade não encontrada." };
  const dup = await prisma.specialty.findFirst({ where: { clinicId: g.clinicId, name, NOT: { id } } });
  if (dup) return { error: "Já existe uma especialidade com esse nome." };
  const updated = await prisma.specialty.update({
    where: { id: existing.id },
    data: { name, color: nonEmpty(values.color) || "#0C7C74" },
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
  if (!existing) return { error: "Especialidade não encontrada." };
  const doctorCount = await prisma.doctor.count({ where: { clinicId: g.clinicId, specialtyId: id } });
  if (doctorCount > 0) return { error: "Não pode apagar uma especialidade com médicos associados." };
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
  if (name.length < 3) return { error: "Indique o nome do médico." };
  if (!nonEmpty(values.specialtyId)) return { error: "Selecione a especialidade." };
  const spec = await prisma.specialty.findFirst({ where: { id: values.specialtyId, clinicId: g.clinicId } });
  if (!spec) return { error: "Especialidade inválida." };
  const price = parseMZN(values.consultationPrice || "0") || 150000;
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
  if (!existing) return { error: "Médico não encontrado." };
  const name = nonEmpty(values.name);
  if (name.length < 3) return { error: "Indique o nome do médico." };
  if (!nonEmpty(values.specialtyId)) return { error: "Selecione a especialidade." };
  const spec = await prisma.specialty.findFirst({ where: { id: values.specialtyId, clinicId: g.clinicId } });
  if (!spec) return { error: "Especialidade inválida." };
  const price = parseMZN(values.consultationPrice || "0") || 150000;
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
  if (!existing) return { error: "Médico não encontrado." };

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
    const message = error instanceof Error ? error.message : "Não foi possível apagar o médico.";
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
  if (name.length < 2) return { error: "Indique o nome do fornecedor." };
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
  if (name.length < 2) return { error: "Indique o nome do fornecedor." };
  const existing = await prisma.supplier.findFirst({ where: { id, clinicId: g.clinicId }, select: { id: true } });
  if (!existing) return { error: "Fornecedor não encontrado." };
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
  if (!existing) return { error: "Fornecedor não encontrado." };
  const purchaseCount = await prisma.purchase.count({ where: { clinicId: g.clinicId, supplierId: id } });
  const itemCount = await prisma.inventoryItem.count({ where: { clinicId: g.clinicId, supplierId: id } });
  if (purchaseCount > 0 || itemCount > 0) return { error: "Não pode apagar um fornecedor com compras ou artigos associados." };
  await prisma.supplier.delete({ where: { id: existing.id } });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "supplier.delete", entity: "Supplier", entityId: existing.id });
  revalidatePath("/fornecedores");
  return { ok: true, id: existing.id };
}

// ── Health plan ──────────────────────────────────────────────────────────
export async function createHealthPlanRecord(values: Values): Promise<Result> {
  const g = await guard("healthplan.manage");
  if ("error" in g) return g;
  if (!nonEmpty(values.insuranceCompanyId)) return { error: "Selecione a seguradora." };
  const name = nonEmpty(values.name);
  if (name.length < 2) return { error: "Indique o nome do plano." };
  const insurer = await prisma.healthInsuranceCompany.findFirst({ where: { id: values.insuranceCompanyId, clinicId: g.clinicId } });
  if (!insurer) return { error: "Seguradora inválida." };
  const p = await prisma.healthPlan.create({
    data: {
      clinicId: g.clinicId,
      insuranceCompanyId: insurer.id,
      name,
      contractPrice: parseMZN(values.contractPrice || "0"),
      patientCopay: parseMZN(values.patientCopay || "0"),
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
  if (!existing) return { error: "Plano não encontrado." };
  if (!nonEmpty(values.insuranceCompanyId)) return { error: "Selecione a seguradora." };
  const insurer = await prisma.healthInsuranceCompany.findFirst({ where: { id: values.insuranceCompanyId, clinicId: g.clinicId } });
  if (!insurer) return { error: "Seguradora inválida." };
  const name = nonEmpty(values.name);
  if (name.length < 2) return { error: "Indique o nome do plano." };
  const updated = await prisma.healthPlan.update({
    where: { id: existing.id },
    data: {
      insuranceCompanyId: insurer.id,
      name,
      contractPrice: parseMZN(values.contractPrice || "0"),
      patientCopay: parseMZN(values.patientCopay || "0"),
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
  if (!existing) return { error: "Plano não encontrado." };
  const linkCount = await prisma.patientHealthPlan.count({ where: { clinicId: g.clinicId, healthPlanId: id } });
  const appointmentCount = await prisma.appointment.count({ where: { clinicId: g.clinicId, healthPlanId: id } });
  if (linkCount > 0 || appointmentCount > 0) return { error: "Não pode apagar um plano com associações existentes." };
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
  if (name.length < 2) return { error: "Indique o nome do artigo." };
  if (sku.length < 1) return { error: "Indique o SKU." };
  const dup = await prisma.inventoryItem.findFirst({ where: { clinicId: g.clinicId, sku } });
  if (dup) return { error: "Já existe um artigo com esse SKU." };
  const cost = parseMZN(values.purchasePrice || "0");
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
  if (!existing) return { error: "Artigo não encontrado." };
  const name = nonEmpty(values.name);
  const sku = nonEmpty(values.sku);
  if (name.length < 2) return { error: "Indique o nome do artigo." };
  if (sku.length < 1) return { error: "Indique o SKU." };
  const dup = await prisma.inventoryItem.findFirst({ where: { clinicId: g.clinicId, sku, NOT: { id } } });
  if (dup) return { error: "Já existe um artigo com esse SKU." };
  const cost = parseMZN(values.purchasePrice || "0");
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
  if (!existing) return { error: "Artigo não encontrado." };
  const movementCount = await prisma.inventoryMovement.count({ where: { clinicId: g.clinicId, itemId: id } });
  const purchaseItemCount = await prisma.purchaseItem.count({ where: { itemId: id } });
  if (movementCount > 0 || purchaseItemCount > 0) return { error: "Não pode apagar um artigo com movimentos ou compras associadas." };
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
  if (name.length < 2) return { error: "Indique o nome do serviço." };
  const dup = await prisma.service.findFirst({ where: { clinicId: g.clinicId, name } });
  if (dup) return { error: "Já existe um serviço com esse nome." };
  const price = parseMZN(values.basePrice || "0");
  if (price <= 0) return { error: "Indique um preço válido." };
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
  if (!existing) return { error: "Serviço não encontrado." };
  const name = nonEmpty(values.name);
  if (name.length < 2) return { error: "Indique o nome do serviço." };
  const dup = await prisma.service.findFirst({ where: { clinicId: g.clinicId, name, NOT: { id } } });
  if (dup) return { error: "Já existe um serviço com esse nome." };
  const price = parseMZN(values.basePrice || "0");
  if (price <= 0) return { error: "Indique um preço válido." };
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
  if (!existing) return { error: "Serviço não encontrado." };
  const appointmentCount = await prisma.appointment.count({ where: { clinicId: g.clinicId, serviceId: id } });
  const invoiceItemCount = await prisma.invoiceItem.count({ where: { serviceId: id } });
  if (appointmentCount > 0 || invoiceItemCount > 0) return { error: "Não pode apagar um serviço com marcações ou facturas associadas." };
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
  if (description.length < 2) return { error: "Indique a descrição da despesa." };
  const amount = parseMZN(values.amount || "0");
  if (amount <= 0) return { error: "Indique um valor válido." };
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
  if (!existing) return { error: "Despesa não encontrada." };
  const description = nonEmpty(values.description);
  if (description.length < 2) return { error: "Indique a descrição da despesa." };
  const amount = parseMZN(values.amount || "0");
  if (amount <= 0) return { error: "Indique um valor válido." };
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
  if (!existing) return { error: "Despesa não encontrada." };
  await prisma.expense.delete({ where: { id: existing.id } });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "expense.delete", entity: "Expense", entityId: existing.id });
  revalidatePath("/financeiro");
  return { ok: true, id: existing.id };
}
