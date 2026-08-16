"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { parseMZN } from "@/lib/money";
import { normalizePatientData } from "@/server/patient-data";

type Values = Record<string, string>;
type Result = { ok: true; id?: string } | { error: string };

async function guard(permission: Permission): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const user = await requireUser();
  if (!can(user.role, permission)) return { error: "Sem permissão para esta operação." };
  return { clinicId: user.clinicId, userId: user.userId };
}

const nonEmpty = (v?: string) => (v ?? "").trim();

// ── Patient ──────────────────────────────────────────────────────────────
export async function createPatientRecord(values: Values): Promise<Result> {
  const g = await guard("patient.manage");
  if ("error" in g) return g;
  const schema = z.object({ name: z.string().min(3, "Nome demasiado curto.") });
  const parsed = schema.safeParse({ name: nonEmpty(values.name) });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const count = await prisma.patient.count({ where: { clinicId: g.clinicId } });
  const code = `PAC-${String(count + 1).padStart(5, "0")}`;
  const normalized = normalizePatientData(values);

  const p = await prisma.patient.create({
    data: {
      clinicId: g.clinicId,
      code,
      ...normalized,
    },
    select: { id: true },
  });
  await audit({ clinicId: g.clinicId, userId: g.userId, action: "patient.create", entity: "Patient", entityId: p.id });
  revalidatePath("/pacientes");
  return { ok: true, id: p.id };
}

export async function updatePatientRecord(patientId: string, values: Values): Promise<Result> {
  const g = await guard("patient.manage");
  if ("error" in g) return g;

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: g.clinicId },
    select: { id: true },
  });

  if (!patient) return { error: "Paciente não encontrado." };

  try {
    const normalized = normalizePatientData(values);
    await prisma.patient.update({
      where: { id: patient.id },
      data: {
        name: normalized.name,
        phone: normalized.phone,
        email: normalized.email,
        address: normalized.address,
        gender: normalized.gender,
        birthDate: normalized.birthDate,
        emergencyContactName: normalized.emergencyContactName,
        emergencyContactPhone: normalized.emergencyContactPhone,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dados inválidos.";
    return { error: message };
  }

  await audit({ clinicId: g.clinicId, userId: g.userId, action: "patient.update", entity: "Patient", entityId: patient.id });
  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true, id: patient.id };
}

export async function deletePatientRecord(patientId: string): Promise<Result> {
  const g = await guard("patient.manage");
  if ("error" in g) return g;

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: g.clinicId },
    select: { id: true },
  });

  if (!patient) return { error: "Paciente não encontrado." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { patientId: patient.id, clinicId: g.clinicId } });
      await tx.revenue.deleteMany({ where: { patientId: patient.id, clinicId: g.clinicId } });
      await tx.invoice.deleteMany({ where: { patientId: patient.id, clinicId: g.clinicId } });
      await tx.consultation.deleteMany({ where: { patientId: patient.id, clinicId: g.clinicId } });
      await tx.appointment.deleteMany({ where: { patientId: patient.id, clinicId: g.clinicId } });
      await tx.patientHealthPlan.deleteMany({ where: { patientId: patient.id, clinicId: g.clinicId } });
      await tx.patient.delete({ where: { id: patient.id, clinicId: g.clinicId } });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível apagar o paciente.";
    return { error: message };
  }

  await audit({ clinicId: g.clinicId, userId: g.userId, action: "patient.delete", entity: "Patient", entityId: patient.id });
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
