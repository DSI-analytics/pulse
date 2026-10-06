import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { checkAllergyConflicts, normaliseSubstance, requiresOverride } from "@/lib/domain/allergy-check";
import { isValidIcdCode, normaliseIcdCode } from "@/lib/domain/icd";
import { computeBmi, parseVital, type VitalKey } from "@/lib/domain/vitals";
import type { DoctorMobileContext } from "@/lib/doctor-mobile-auth";
import { prisma } from "@/lib/prisma";
import { formatSequence, nextSequenceValue, SEQUENCE_PREFIX, withNumberRetry } from "@/lib/sequences";
import { lookupIcdCode, rememberIcdCode } from "@/server/icd11";
import { notifyDoctor } from "@/server/doctor-push-notifications";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VITAL_FIELDS: VitalKey[] = [
  "systolic", "diastolic", "heartRate", "respiratoryRate", "temperature",
  "oxygenSaturation", "weightKg", "heightCm", "glucose", "painScore",
];

function actor(context: DoctorMobileContext) {
  return {
    clinicId: context.clinicId,
    userId: context.userId,
    userName: context.name,
    userRole: context.role,
    sessionId: context.sessionId,
  } as const;
}

function nullable(value: string | null | undefined, max: number) {
  const clean = value?.trim().slice(0, max);
  return clean || null;
}

async function patientExists(context: DoctorMobileContext, patientId: string) {
  return prisma.patient.findFirst({
    where: { id: patientId, clinicId: context.clinicId, isActive: true },
    select: { id: true, name: true },
  });
}

export async function getDoctorMobilePatients(context: DoctorMobileContext, url: URL) {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const patients = await prisma.patient.findMany({
    where: {
      clinicId: context.clinicId,
      isActive: true,
      ...(query ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { code: { contains: query, mode: "insensitive" as const } },
          { phone: { contains: query } },
          { email: { contains: query, mode: "insensitive" as const } },
        ],
      } : {}),
    },
    orderBy: { name: "asc" },
    take: 80,
    select: {
      id: true, code: true, name: true, birthDate: true, gender: true, phone: true,
      bloodType: true, chronicConditions: true,
      allergies: { where: { status: "ACTIVA" }, select: { severity: true } },
      appointments: {
        where: { doctorId: context.doctorId },
        orderBy: { startAt: "desc" }, take: 1,
        select: { startAt: true, status: true },
      },
    },
  });
  return { patients };
}

export async function getDoctorMobilePatient(context: DoctorMobileContext, patientId: string) {
  return prisma.patient.findFirst({
    where: { id: patientId, clinicId: context.clinicId, isActive: true },
    select: {
      id: true, code: true, name: true, birthDate: true, gender: true,
      genderIdentity: true, maritalStatus: true, nationality: true, occupation: true,
      phone: true, phoneAlt: true, email: true, address: true, country: true,
      province: true, district: true, city: true, neighbourhood: true, street: true,
      streetNumber: true, addressReference: true, emergencyContactName: true,
      emergencyContactRelation: true, emergencyContactPhone: true,
      emergencyContactPhoneAlt: true, bloodType: true, chronicConditions: true,
      personalHistory: true, surgicalHistory: true, familyHistory: true, habits: true,
      clinicalSummary: true, notes: true, registeredAt: true,
      healthPlans: {
        where: { isPrimary: true }, take: 1,
        select: {
          membershipNumber: true, validUntil: true,
          healthPlan: { select: { name: true, insuranceCompany: { select: { name: true } } } },
        },
      },
      vitalSigns: {
        orderBy: { recordedAt: "desc" }, take: 20,
        select: {
          id: true, source: true, recordedAt: true, systolic: true, diastolic: true,
          heartRate: true, respiratoryRate: true, temperature: true,
          oxygenSaturation: true, weightKg: true, heightCm: true, bmi: true,
          glucose: true, painScore: true, notes: true,
        },
      },
      allergies: {
        orderBy: { createdAt: "desc" }, take: 30,
        select: {
          id: true, substance: true, category: true, kind: true, reaction: true,
          severity: true, status: true, identifiedAt: true, notes: true, createdAt: true,
        },
      },
      diagnoses: {
        where: { isActive: true }, orderBy: { recordedAt: "desc" }, take: 40,
        select: {
          id: true, code: true, codeSystem: true, description: true, kind: true,
          certainty: true, onsetDate: true, recordedAt: true, notes: true,
          doctor: { select: { name: true } },
        },
      },
      prescriptions: {
        orderBy: { issuedAt: "desc" }, take: 30,
        select: {
          id: true, number: true, status: true, issuedAt: true, validUntil: true, notes: true,
          items: {
            select: {
              id: true, medicationName: true, activeIngredient: true, dose: true,
              doseUnit: true, route: true, frequency: true, durationDays: true,
              quantity: true, instructions: true, status: true,
            },
          },
        },
      },
      diagnosticOrders: {
        orderBy: { requestedAt: "desc" }, take: 40,
        select: {
          id: true, number: true, category: true, name: true, priority: true,
          status: true, requestedAt: true, scheduledAt: true, collectedAt: true, notes: true,
          result: {
            select: {
              id: true, conclusion: true, notes: true, performedAt: true, performedBy: true,
              validatedAt: true,
              items: { select: { id: true, name: true, value: true, unit: true, referenceRange: true, isAbnormal: true, flag: true } },
            },
          },
        },
      },
      procedures: {
        orderBy: { performedAt: "desc" }, take: 30,
        select: { id: true, name: true, status: true, performedAt: true, description: true, outcome: true, complications: true, notes: true },
      },
      treatments: {
        orderBy: { startedAt: "desc" }, take: 30,
        select: { id: true, name: true, plan: true, startedAt: true, endedAt: true, status: true, evolution: true },
      },
      admissions: {
        orderBy: { admittedAt: "desc" }, take: 20,
        select: {
          id: true, number: true, admittedAt: true, reason: true, ward: true, room: true,
          bed: true, diagnosis: true, evolution: true, dischargedAt: true,
          dischargeSummary: true, dischargeRecommendations: true, status: true,
        },
      },
      attachments: {
        where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 30,
        select: { id: true, name: true, description: true, category: true, mimeType: true, sizeBytes: true, authorName: true, documentDate: true, createdAt: true },
      },
      appointments: {
        where: { doctorId: context.doctorId }, orderBy: { startAt: "desc" }, take: 40,
        select: { id: true, startAt: true, endAt: true, status: true, type: true, reason: true, specialty: { select: { name: true } } },
      },
    },
  });
}

export async function getDoctorMobileCatalogs(context: DoctorMobileContext) {
  const [medications, services, doctors] = await Promise.all([
    prisma.medication.findMany({
      where: { clinicId: context.clinicId, isActive: true }, orderBy: { name: "asc" }, take: 500,
      select: { id: true, name: true, activeIngredient: true, form: true, strength: true },
    }),
    prisma.service.findMany({
      where: { clinicId: context.clinicId, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, source: true, basePrice: true },
    }),
    prisma.doctor.findMany({
      where: { clinicId: context.clinicId, status: "ACTIVO" }, orderBy: { name: "asc" },
      select: {
        id: true, name: true, phone: true, email: true, licenseNumber: true,
        specialty: { select: { name: true } },
        schedules: { orderBy: { weekday: "asc" }, select: { weekday: true, startTime: true, endTime: true, breakStart: true, breakEnd: true } },
      },
    }),
  ]);
  return { medications, services, doctors };
}

const vitalsSchema = z.object({
  systolic: z.union([z.number(), z.string()]).nullable().optional(),
  diastolic: z.union([z.number(), z.string()]).nullable().optional(),
  heartRate: z.union([z.number(), z.string()]).nullable().optional(),
  respiratoryRate: z.union([z.number(), z.string()]).nullable().optional(),
  temperature: z.union([z.number(), z.string()]).nullable().optional(),
  oxygenSaturation: z.union([z.number(), z.string()]).nullable().optional(),
  weightKg: z.union([z.number(), z.string()]).nullable().optional(),
  heightCm: z.union([z.number(), z.string()]).nullable().optional(),
  glucose: z.union([z.number(), z.string()]).nullable().optional(),
  painScore: z.union([z.number(), z.string()]).nullable().optional(),
  source: z.enum(["CONSULTA", "TRIAGEM", "INTERNAMENTO", "DOMICILIO"]).optional().default("CONSULTA"),
  notes: z.string().max(2000).optional().default(""),
  consultationId: z.string().optional(),
});

export async function recordDoctorMobileVitals(context: DoctorMobileContext, patientId: string, input: unknown) {
  const parsed = vitalsSchema.safeParse(input);
  if (!parsed.success) return { error: "Sinais vitais inválidos." } as const;
  const patient = await patientExists(context, patientId);
  if (!patient) return { error: "Paciente não encontrado." } as const;
  const numbers: Partial<Record<VitalKey, number | null>> = {};
  try {
    for (const key of VITAL_FIELDS) numbers[key] = parseVital(key, parsed.data[key]);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Sinais vitais inválidos." } as const;
  }
  if (VITAL_FIELDS.every((key) => numbers[key] == null)) return { error: "Introduza pelo menos um sinal vital." } as const;
  let consultationId: string | null = null;
  if (parsed.data.consultationId) {
    const consultation = await prisma.consultation.findFirst({
      where: { id: parsed.data.consultationId, clinicId: context.clinicId, patientId }, select: { id: true },
    });
    consultationId = consultation?.id ?? null;
  }
  const created = await prisma.vitalSign.create({
    data: {
      clinicId: context.clinicId, patientId, consultationId,
      source: parsed.data.source, recordedById: context.userId,
      ...numbers,
      bmi: computeBmi(numbers.weightKg, numbers.heightCm),
      notes: nullable(parsed.data.notes, 2000),
    },
    select: { id: true },
  });
  await audit({ ...actor(context), action: "vitals.mobile.create", entity: "VitalSign", entityId: created.id, metadata: { patientId } });
  return { ok: true, id: created.id } as const;
}

const allergySchema = z.object({
  substance: z.string().trim().min(2).max(200),
  category: z.enum(["MEDICAMENTO", "ALIMENTO", "AMBIENTAL", "BIOLOGICO", "OUTRO"]).default("MEDICAMENTO"),
  kind: z.enum(["ALERGIA", "INTOLERANCIA"]).default("ALERGIA"),
  reaction: z.string().max(1000).optional().default(""),
  severity: z.enum(["LEVE", "MODERADA", "GRAVE", "FATAL"]).default("MODERADA"),
  identifiedAt: z.string().regex(DATE).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().default(""),
});

export async function addDoctorMobileAllergy(context: DoctorMobileContext, patientId: string, input: unknown) {
  const parsed = allergySchema.safeParse(input);
  if (!parsed.success) return { error: "Dados da alergia inválidos." } as const;
  const patient = await patientExists(context, patientId);
  if (!patient) return { error: "Paciente não encontrado." } as const;
  const substanceKey = normaliseSubstance(parsed.data.substance);
  const duplicate = await prisma.allergy.findFirst({ where: { clinicId: context.clinicId, patientId, substanceKey, status: "ACTIVA" }, select: { id: true } });
  if (duplicate) return { error: "Esta alergia já está ativa no prontuário." } as const;
  const created = await prisma.allergy.create({
    data: {
      clinicId: context.clinicId, patientId, substance: parsed.data.substance, substanceKey,
      category: parsed.data.category, kind: parsed.data.kind, reaction: nullable(parsed.data.reaction, 1000),
      severity: parsed.data.severity,
      identifiedAt: parsed.data.identifiedAt ? new Date(`${parsed.data.identifiedAt}T00:00:00.000Z`) : null,
      notes: nullable(parsed.data.notes, 2000), doctorId: context.doctorId, recordedById: context.userId,
    },
    select: { id: true, substance: true, severity: true },
  });
  await audit({ ...actor(context), action: "allergy.mobile.create", entity: "Allergy", entityId: created.id, metadata: { patientId } });
  if (created.severity === "GRAVE" || created.severity === "FATAL") {
    await notifyDoctor({
      doctorId: context.doctorId, clinicId: context.clinicId, category: "clinicalAlerts",
      type: "ALERTA_CLINICO", severity: "CRITICO", title: `Alergia grave — ${patient.name}`,
      body: `${created.substance} (${created.severity.toLowerCase()})`, entity: "Patient", entityId: patientId,
    });
  }
  return { ok: true, id: created.id } as const;
}

const diagnosisSchema = z.object({
  code: z.string().trim().min(2).max(12),
  uri: z.string().max(400).optional().default(""),
  release: z.string().max(32).optional().default(""),
  kind: z.enum(["PRINCIPAL", "SECUNDARIO", "DIFERENCIAL"]).default("PRINCIPAL"),
  certainty: z.enum(["PROVISORIO", "CONFIRMADO"]).default("PROVISORIO"),
  onsetDate: z.string().regex(DATE).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().default(""),
  consultationId: z.string().optional(),
});

export async function addDoctorMobileDiagnosis(context: DoctorMobileContext, patientId: string, input: unknown) {
  const parsed = diagnosisSchema.safeParse(input);
  if (!parsed.success) return { error: "Diagnóstico inválido." } as const;
  const patient = await patientExists(context, patientId);
  if (!patient) return { error: "Paciente não encontrado." } as const;
  const code = normaliseIcdCode(parsed.data.code);
  if (!isValidIcdCode(code)) return { error: "Selecione um código CID-11 válido." } as const;
  const hit = await lookupIcdCode(code, "pt");
  if (!hit) return { error: `O código CID-11 ${code} não foi confirmado no catálogo.` } as const;
  await rememberIcdCode(hit, "pt");
  const consultation = parsed.data.consultationId
    ? await prisma.consultation.findFirst({ where: { id: parsed.data.consultationId, clinicId: context.clinicId, patientId }, select: { id: true, encounterId: true } })
    : null;
  const created = await prisma.diagnosis.create({
    data: {
      clinicId: context.clinicId, patientId, consultationId: consultation?.id,
      encounterId: consultation?.encounterId, kind: parsed.data.kind, certainty: parsed.data.certainty,
      code: hit.code, codeSystem: "ICD-11", codeUri: hit.uri ?? nullable(parsed.data.uri, 400),
      codeRelease: hit.release || nullable(parsed.data.release, 32), description: hit.title,
      onsetDate: parsed.data.onsetDate ? new Date(`${parsed.data.onsetDate}T00:00:00.000Z`) : null,
      notes: nullable(parsed.data.notes, 4000), doctorId: context.doctorId, recordedById: context.userId,
    },
    select: { id: true },
  });
  await audit({ ...actor(context), action: "diagnosis.mobile.create", entity: "Diagnosis", entityId: created.id, metadata: { patientId, code: hit.code } });
  return { ok: true, id: created.id } as const;
}

const prescriptionItemSchema = z.object({
  medicationId: z.string().optional().default(""),
  medicationName: z.string().trim().min(2).max(200),
  activeIngredient: z.string().max(200).optional().default(""),
  dose: z.string().max(60).optional().default(""), doseUnit: z.string().max(30).optional().default(""),
  route: z.enum(["ORAL", "INTRAVENOSA", "INTRAMUSCULAR", "SUBCUTANEA", "TOPICA", "INALATORIA", "RECTAL", "OFTALMICA", "OTOLOGICA", "NASAL", "OUTRA"]).optional(),
  frequency: z.string().max(120).optional().default(""), durationDays: z.number().int().min(0).max(3650).nullable().optional(),
  quantity: z.string().max(60).optional().default(""), instructions: z.string().max(2000).optional().default(""),
});
const prescriptionSchema = z.object({
  consultationId: z.string().optional(), validUntil: z.string().regex(DATE).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().default(""), acknowledgeAllergyWarnings: z.boolean().optional().default(false),
  items: z.array(prescriptionItemSchema).min(1).max(20),
});

export async function createDoctorMobilePrescription(context: DoctorMobileContext, patientId: string, input: unknown) {
  const parsed = prescriptionSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados da receita inválidos." } as const;
  const patient = await patientExists(context, patientId);
  if (!patient) return { error: "Paciente não encontrado." } as const;
  const catalogIds = parsed.data.items.map((item) => item.medicationId).filter(Boolean);
  const catalog = catalogIds.length ? await prisma.medication.findMany({
    where: { id: { in: catalogIds }, clinicId: context.clinicId, isActive: true },
    select: { id: true, name: true, activeIngredient: true },
  }) : [];
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  if (catalogIds.some((id) => !catalogById.has(id))) return { error: "Um medicamento selecionado não pertence ao catálogo da clínica." } as const;
  const allergies = await prisma.allergy.findMany({
    where: { clinicId: context.clinicId, patientId, status: "ACTIVA" },
    select: { id: true, substance: true, substanceKey: true, severity: true, kind: true, reaction: true },
  });
  const items = parsed.data.items.map((item) => {
    const fromCatalog = item.medicationId ? catalogById.get(item.medicationId) : null;
    const medicationName = fromCatalog?.name ?? item.medicationName;
    const activeIngredient = item.activeIngredient || fromCatalog?.activeIngredient || null;
    return { item, medicationName, activeIngredient, warnings: checkAllergyConflicts({ medicationName, activeIngredient }, allergies) };
  });
  const warnings = items.flatMap((item) => item.warnings);
  if (requiresOverride(warnings) && !parsed.data.acknowledgeAllergyWarnings) {
    return { error: `Existem alertas graves de alergia: ${warnings.filter((warning) => warning.severity === "GRAVE" || warning.severity === "FATAL").map((warning) => warning.substance).join(", ")}. Confirme explicitamente para emitir.` , warnings } as const;
  }
  const consultation = parsed.data.consultationId
    ? await prisma.consultation.findFirst({ where: { id: parsed.data.consultationId, clinicId: context.clinicId, patientId }, select: { id: true, encounterId: true } })
    : null;
  const now = new Date();
  const year = now.getUTCFullYear();
  const created = await withNumberRetry(async () => {
    const numbers = await prisma.prescription.findMany({
      where: { clinicId: context.clinicId, number: { startsWith: `${SEQUENCE_PREFIX.prescription}-${year}-` } }, select: { number: true },
    });
    return prisma.prescription.create({
      data: {
        clinicId: context.clinicId, patientId, consultationId: consultation?.id,
        encounterId: consultation?.encounterId, doctorId: context.doctorId,
        number: formatSequence("prescription", year, nextSequenceValue("prescription", year, numbers.map((item) => item.number))),
        validUntil: parsed.data.validUntil ? new Date(`${parsed.data.validUntil}T00:00:00.000Z`) : null,
        notes: nullable(parsed.data.notes, 2000), createdById: context.userId,
        items: {
          create: items.map(({ item, medicationName, activeIngredient, warnings: itemWarnings }) => ({
            medicationId: item.medicationId || null, medicationName, activeIngredient,
            dose: nullable(item.dose, 60), doseUnit: nullable(item.doseUnit, 30), route: item.route ?? null,
            frequency: nullable(item.frequency, 120), durationDays: item.durationDays ?? null,
            quantity: nullable(item.quantity, 60), instructions: nullable(item.instructions, 2000),
            allergyWarnings: itemWarnings.length ? itemWarnings as unknown as Prisma.InputJsonValue : undefined,
          })),
        },
      },
      select: { id: true, number: true },
    });
  });
  await audit({ ...actor(context), action: "prescription.mobile.create", entity: "Prescription", entityId: created.id, metadata: { patientId, items: items.length, allergyWarnings: warnings.length } });
  return { ok: true, id: created.id, number: created.number, warnings } as const;
}

const orderSchema = z.object({
  name: z.string().trim().min(2).max(240),
  category: z.enum(["LABORATORIO", "IMAGIOLOGIA", "OUTRO"]).default("LABORATORIO"),
  priority: z.enum(["ROTINA", "URGENTE", "EMERGENTE"]).default("ROTINA"),
  code: z.string().max(60).optional().default(""), notes: z.string().max(2000).optional().default(""),
  serviceId: z.string().optional().default(""), consultationId: z.string().optional(),
});

export async function createDoctorMobileDiagnosticOrder(context: DoctorMobileContext, patientId: string, input: unknown) {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados do pedido de exame inválidos." } as const;
  const patient = await patientExists(context, patientId);
  if (!patient) return { error: "Paciente não encontrado." } as const;
  if (parsed.data.serviceId) {
    const service = await prisma.service.findFirst({ where: { id: parsed.data.serviceId, clinicId: context.clinicId, isActive: true }, select: { id: true } });
    if (!service) return { error: "Exame ou serviço inválido." } as const;
  }
  const consultation = parsed.data.consultationId
    ? await prisma.consultation.findFirst({ where: { id: parsed.data.consultationId, clinicId: context.clinicId, patientId }, select: { id: true, encounterId: true } })
    : null;
  const now = new Date();
  const year = now.getUTCFullYear();
  const created = await withNumberRetry(async () => {
    const numbers = await prisma.diagnosticOrder.findMany({
      where: { clinicId: context.clinicId, number: { startsWith: `${SEQUENCE_PREFIX.diagnosticOrder}-${year}-` } }, select: { number: true },
    });
    return prisma.diagnosticOrder.create({
      data: {
        clinicId: context.clinicId, patientId, consultationId: consultation?.id,
        encounterId: consultation?.encounterId, serviceId: parsed.data.serviceId || null,
        number: formatSequence("diagnosticOrder", year, nextSequenceValue("diagnosticOrder", year, numbers.map((item) => item.number))),
        category: parsed.data.category, name: parsed.data.name, code: nullable(parsed.data.code, 60),
        priority: parsed.data.priority, doctorId: context.doctorId, requestedById: context.userId,
        notes: nullable(parsed.data.notes, 2000),
      }, select: { id: true, number: true },
    });
  });
  await audit({ ...actor(context), action: "lab.order.mobile.create", entity: "DiagnosticOrder", entityId: created.id, metadata: { patientId } });
  return { ok: true, id: created.id, number: created.number } as const;
}

const procedureSchema = z.object({
  name: z.string().trim().min(2).max(200), serviceId: z.string().optional().default(""),
  status: z.enum(["PLANEADO", "REALIZADO", "CANCELADO"]).default("REALIZADO"),
  description: z.string().max(4000).optional().default(""), outcome: z.string().max(2000).optional().default(""),
  complications: z.string().max(2000).optional().default(""), notes: z.string().max(2000).optional().default(""),
});

export async function addDoctorMobileProcedure(context: DoctorMobileContext, patientId: string, input: unknown) {
  const parsed = procedureSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados do procedimento inválidos." } as const;
  const patient = await patientExists(context, patientId);
  if (!patient) return { error: "Paciente não encontrado." } as const;
  if (parsed.data.serviceId) {
    const service = await prisma.service.findFirst({ where: { id: parsed.data.serviceId, clinicId: context.clinicId, isActive: true }, select: { id: true } });
    if (!service) return { error: "Serviço inválido." } as const;
  }
  const created = await prisma.clinicalProcedure.create({
    data: {
      clinicId: context.clinicId, patientId, serviceId: parsed.data.serviceId || null,
      name: parsed.data.name, status: parsed.data.status, doctorId: context.doctorId,
      description: nullable(parsed.data.description, 4000), outcome: nullable(parsed.data.outcome, 2000),
      complications: nullable(parsed.data.complications, 2000), notes: nullable(parsed.data.notes, 2000),
      recordedById: context.userId,
    }, select: { id: true },
  });
  await audit({ ...actor(context), action: "procedure.mobile.create", entity: "ClinicalProcedure", entityId: created.id, metadata: { patientId } });
  return { ok: true, id: created.id } as const;
}

const treatmentSchema = z.object({
  name: z.string().trim().min(2).max(240), plan: z.string().max(4000).optional().default(""),
  status: z.enum(["PLANEADO", "EM_CURSO", "CONCLUIDO", "SUSPENSO", "CANCELADO"]).default("EM_CURSO"),
  evolution: z.string().max(4000).optional().default(""),
});

export async function addDoctorMobileTreatment(context: DoctorMobileContext, patientId: string, input: unknown) {
  const parsed = treatmentSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados do tratamento inválidos." } as const;
  const patient = await patientExists(context, patientId);
  if (!patient) return { error: "Paciente não encontrado." } as const;
  const created = await prisma.treatment.create({
    data: {
      clinicId: context.clinicId, patientId, name: parsed.data.name,
      plan: nullable(parsed.data.plan, 4000), status: parsed.data.status,
      evolution: nullable(parsed.data.evolution, 4000), doctorId: context.doctorId,
      endedAt: parsed.data.status === "CONCLUIDO" ? new Date() : null,
    }, select: { id: true },
  });
  await audit({ ...actor(context), action: "treatment.mobile.create", entity: "Treatment", entityId: created.id, metadata: { patientId } });
  return { ok: true, id: created.id } as const;
}

const admissionSchema = z.object({
  reason: z.string().max(2000).optional().default(""), ward: z.string().max(120).optional().default(""),
  room: z.string().max(60).optional().default(""), bed: z.string().max(60).optional().default(""),
  diagnosis: z.string().max(2000).optional().default(""),
});

export async function createDoctorMobileAdmission(context: DoctorMobileContext, patientId: string, input: unknown) {
  const parsed = admissionSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados do internamento inválidos." } as const;
  const patient = await patientExists(context, patientId);
  if (!patient) return { error: "Paciente não encontrado." } as const;
  const open = await prisma.admission.findFirst({ where: { clinicId: context.clinicId, patientId, status: "ADMITIDO" }, select: { number: true } });
  if (open) return { error: `O paciente já possui o internamento ativo ${open.number}.` } as const;
  const now = new Date();
  const year = now.getUTCFullYear();
  const created = await withNumberRetry(async () => {
    const numbers = await prisma.admission.findMany({
      where: { clinicId: context.clinicId, number: { startsWith: `${SEQUENCE_PREFIX.admission}-${year}-` } }, select: { number: true },
    });
    return prisma.admission.create({
      data: {
        clinicId: context.clinicId, patientId,
        number: formatSequence("admission", year, nextSequenceValue("admission", year, numbers.map((item) => item.number))),
        reason: nullable(parsed.data.reason, 2000), ward: nullable(parsed.data.ward, 120),
        room: nullable(parsed.data.room, 60), bed: nullable(parsed.data.bed, 60),
        diagnosis: nullable(parsed.data.diagnosis, 2000), doctorId: context.doctorId, createdById: context.userId,
      }, select: { id: true, number: true },
    });
  });
  await audit({ ...actor(context), action: "admission.mobile.create", entity: "Admission", entityId: created.id, metadata: { patientId } });
  return { ok: true, id: created.id, number: created.number } as const;
}

const dischargeSchema = z.object({
  summary: z.string().max(8000).optional().default(""), recommendations: z.string().max(4000).optional().default(""),
  evolution: z.string().max(8000).optional().default(""),
});

export async function dischargeDoctorMobileAdmission(context: DoctorMobileContext, admissionId: string, input: unknown) {
  const parsed = dischargeSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados da alta inválidos." } as const;
  const admission = await prisma.admission.findFirst({
    where: { id: admissionId, clinicId: context.clinicId }, select: { id: true, patientId: true, status: true, encounterId: true },
  });
  if (!admission) return { error: "Internamento não encontrado." } as const;
  if (admission.status !== "ADMITIDO") return { error: "Este internamento já está encerrado." } as const;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.admission.update({
      where: { id: admission.id },
      data: {
        status: "ALTA", dischargedAt: now, dischargeSummary: nullable(parsed.data.summary, 8000),
        dischargeRecommendations: nullable(parsed.data.recommendations, 4000),
        evolution: nullable(parsed.data.evolution, 8000), version: { increment: 1 },
      },
    });
    if (admission.encounterId) {
      await tx.encounter.update({ where: { id: admission.encounterId }, data: { status: "CONCLUIDO", endedAt: now, version: { increment: 1 } } });
    }
  });
  await audit({ ...actor(context), action: "admission.mobile.discharge", entity: "Admission", entityId: admission.id, metadata: { patientId: admission.patientId } });
  return { ok: true } as const;
}
