import "server-only";
import { prisma } from "@/lib/prisma";
import { bmiBand, computeBmi, flagVitals } from "@/lib/domain/vitals";

/**
 * Leitura do prontuário clínico electrónico.
 *
 * Todas as funções recebem `clinicId` já resolvido pelo chamador a partir da
 * sessão (nunca do cliente) e filtram por ele em todas as consultas — o
 * isolamento por instituição é aplicado na base de dados, não na UI.
 */

export const TIMELINE_TYPES = [
  "EPISODIO",
  "CONSULTA",
  "DIAGNOSTICO",
  "SINAIS_VITAIS",
  "ALERGIA",
  "PRESCRICAO",
  "EXAME",
  "RESULTADO",
  "PROCEDIMENTO",
  "TRATAMENTO",
  "INTERNAMENTO",
  "ALTA",
  "DOCUMENTO",
] as const;

export type TimelineEventType = (typeof TIMELINE_TYPES)[number];

export const TIMELINE_TYPE_LABEL: Record<TimelineEventType, string> = {
  EPISODIO: "Episódio",
  CONSULTA: "Consulta",
  DIAGNOSTICO: "Diagnóstico",
  SINAIS_VITAIS: "Sinais vitais",
  ALERGIA: "Alergia",
  PRESCRICAO: "Prescrição",
  EXAME: "Pedido de exame",
  RESULTADO: "Resultado",
  PROCEDIMENTO: "Procedimento",
  TRATAMENTO: "Tratamento",
  INTERNAMENTO: "Internamento",
  ALTA: "Alta",
  DOCUMENTO: "Documento",
};

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  at: string;
  title: string;
  summary?: string | null;
  professional?: string | null;
  specialty?: string | null;
  encounterId?: string | null;
  severity?: "INFO" | "AVISO" | "CRITICO";
  badge?: string | null;
}

export interface TimelineFilters {
  types?: TimelineEventType[];
  from?: Date | null;
  to?: Date | null;
  specialtyId?: string | null;
  doctorId?: string | null;
  /** Cursor: devolve apenas eventos estritamente anteriores a esta data. */
  before?: Date | null;
  limit?: number;
}

export interface TimelinePage {
  events: TimelineEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function wants(filters: TimelineFilters, type: TimelineEventType): boolean {
  return !filters.types?.length || filters.types.includes(type);
}

function dateWindow(filters: TimelineFilters) {
  const range: { gte?: Date; lte?: Date; lt?: Date } = {};
  if (filters.from) range.gte = filters.from;
  if (filters.to) range.lte = filters.to;
  if (filters.before) range.lt = filters.before;
  return Object.keys(range).length ? range : undefined;
}

/**
 * Linha temporal clínica do paciente.
 *
 * Cada fonte é consultada com `take: limit + 1` sobre um índice
 * `(clinicId, patientId, data)`, nunca carregando o histórico inteiro. O
 * resultado é fundido, ordenado e cortado — a paginação é por cursor de data,
 * pelo que o custo não cresce com a antiguidade do paciente.
 */
export async function getPatientTimeline(
  clinicId: string,
  patientId: string,
  filters: TimelineFilters = {},
): Promise<TimelinePage> {
  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const take = limit + 1;
  const window = dateWindow(filters);
  const base = { clinicId, patientId };
  const bySpecialty = filters.specialtyId ?? undefined;
  const byDoctor = filters.doctorId ?? undefined;

  const [
    encounters,
    consultations,
    diagnoses,
    vitals,
    allergies,
    prescriptions,
    orders,
    results,
    procedures,
    treatments,
    admissions,
    attachments,
  ] = await Promise.all([
    wants(filters, "EPISODIO")
      ? prisma.encounter.findMany({
          where: { ...base, ...(window ? { startedAt: window } : {}), ...(bySpecialty ? { specialtyId: bySpecialty } : {}), ...(byDoctor ? { doctorId: byDoctor } : {}) },
          orderBy: { startedAt: "desc" },
          take,
          select: { id: true, number: true, type: true, status: true, startedAt: true, reason: true, doctor: { select: { name: true } }, specialty: { select: { name: true } } },
        })
      : [],
    wants(filters, "CONSULTA")
      ? prisma.consultation.findMany({
          where: { ...base, ...(window ? { startedAt: window } : {}), ...(byDoctor ? { doctorId: byDoctor } : {}), ...(bySpecialty ? { appointment: { specialtyId: bySpecialty } } : {}) },
          orderBy: { startedAt: "desc" },
          take,
          select: {
            id: true, startedAt: true, encounterId: true, chiefComplaint: true, subjective: true, diagnosis: true,
            doctor: { select: { name: true } }, appointment: { select: { specialty: { select: { name: true } } } },
          },
        })
      : [],
    wants(filters, "DIAGNOSTICO")
      ? prisma.diagnosis.findMany({
          where: { ...base, ...(window ? { recordedAt: window } : {}), ...(byDoctor ? { doctorId: byDoctor } : {}) },
          orderBy: { recordedAt: "desc" },
          take,
          select: { id: true, recordedAt: true, description: true, code: true, codeSystem: true, kind: true, certainty: true, encounterId: true, doctor: { select: { name: true } } },
        })
      : [],
    wants(filters, "SINAIS_VITAIS")
      ? prisma.vitalSign.findMany({
          where: { ...base, ...(window ? { recordedAt: window } : {}) },
          orderBy: { recordedAt: "desc" },
          take,
          select: {
            id: true, recordedAt: true, encounterId: true, systolic: true, diastolic: true, heartRate: true,
            temperature: true, oxygenSaturation: true, weightKg: true, heightCm: true, bmi: true, glucose: true,
            respiratoryRate: true, painScore: true, recordedBy: { select: { name: true } },
          },
        })
      : [],
    wants(filters, "ALERGIA")
      ? prisma.allergy.findMany({
          where: { ...base, ...(window ? { createdAt: window } : {}) },
          orderBy: { createdAt: "desc" },
          take,
          select: { id: true, createdAt: true, substance: true, severity: true, status: true, reaction: true, doctor: { select: { name: true } } },
        })
      : [],
    wants(filters, "PRESCRICAO")
      ? prisma.prescription.findMany({
          where: { ...base, ...(window ? { issuedAt: window } : {}), ...(byDoctor ? { doctorId: byDoctor } : {}) },
          orderBy: { issuedAt: "desc" },
          take,
          select: {
            id: true, number: true, issuedAt: true, status: true, encounterId: true,
            doctor: { select: { name: true } }, items: { select: { medicationName: true, dose: true, doseUnit: true, frequency: true } },
          },
        })
      : [],
    wants(filters, "EXAME")
      ? prisma.diagnosticOrder.findMany({
          where: { ...base, ...(window ? { requestedAt: window } : {}), ...(byDoctor ? { doctorId: byDoctor } : {}) },
          orderBy: { requestedAt: "desc" },
          take,
          select: { id: true, number: true, requestedAt: true, name: true, category: true, priority: true, status: true, encounterId: true, doctor: { select: { name: true } } },
        })
      : [],
    wants(filters, "RESULTADO")
      ? prisma.diagnosticResult.findMany({
          where: { clinicId, order: { patientId }, ...(window ? { performedAt: window } : {}) },
          orderBy: { performedAt: "desc" },
          take,
          select: {
            id: true, performedAt: true, validatedAt: true, conclusion: true,
            order: { select: { name: true, category: true, encounterId: true } },
            items: { where: { isAbnormal: true }, select: { name: true, value: true, unit: true, flag: true }, take: 5 },
          },
        })
      : [],
    wants(filters, "PROCEDIMENTO")
      ? prisma.clinicalProcedure.findMany({
          where: { ...base, ...(window ? { performedAt: window } : {}), ...(byDoctor ? { doctorId: byDoctor } : {}) },
          orderBy: { performedAt: "desc" },
          take,
          select: { id: true, performedAt: true, name: true, status: true, outcome: true, complications: true, encounterId: true, doctor: { select: { name: true } } },
        })
      : [],
    wants(filters, "TRATAMENTO")
      ? prisma.treatment.findMany({
          where: { ...base, ...(window ? { startedAt: window } : {}), ...(byDoctor ? { doctorId: byDoctor } : {}) },
          orderBy: { startedAt: "desc" },
          take,
          select: { id: true, startedAt: true, name: true, status: true, plan: true, encounterId: true, doctor: { select: { name: true } } },
        })
      : [],
    wants(filters, "INTERNAMENTO") || wants(filters, "ALTA")
      ? prisma.admission.findMany({
          where: { ...base, ...(window ? { admittedAt: window } : {}), ...(byDoctor ? { doctorId: byDoctor } : {}) },
          orderBy: { admittedAt: "desc" },
          take,
          select: {
            id: true, number: true, admittedAt: true, dischargedAt: true, reason: true, ward: true, room: true,
            bed: true, status: true, dischargeSummary: true, encounterId: true, doctor: { select: { name: true } },
          },
        })
      : [],
    wants(filters, "DOCUMENTO")
      ? prisma.clinicalAttachment.findMany({
          where: { ...base, deletedAt: null, ...(window ? { createdAt: window } : {}) },
          orderBy: { createdAt: "desc" },
          take,
          select: { id: true, createdAt: true, name: true, category: true, mimeType: true, sizeBytes: true, encounterId: true, uploadedBy: { select: { name: true } } },
        })
      : [],
  ]);

  const events: TimelineEvent[] = [];

  for (const e of encounters) {
    events.push({
      id: `encounter:${e.id}`,
      type: "EPISODIO",
      at: e.startedAt.toISOString(),
      title: `Episódio ${e.number} · ${e.type.replace(/_/g, " ").toLowerCase()}`,
      summary: e.reason,
      professional: e.doctor?.name ?? null,
      specialty: e.specialty?.name ?? null,
      encounterId: e.id,
      badge: e.status,
    });
  }

  for (const c of consultations) {
    events.push({
      id: `consultation:${c.id}`,
      type: "CONSULTA",
      at: c.startedAt.toISOString(),
      title: "Consulta",
      summary: c.chiefComplaint || c.subjective || c.diagnosis,
      professional: c.doctor?.name ?? null,
      specialty: c.appointment?.specialty?.name ?? null,
      encounterId: c.encounterId,
    });
  }

  for (const d of diagnoses) {
    events.push({
      id: `diagnosis:${d.id}`,
      type: "DIAGNOSTICO",
      at: d.recordedAt.toISOString(),
      title: d.description,
      summary: [d.code ? `${d.codeSystem ?? "Código"} ${d.code}` : null, d.kind.toLowerCase(), d.certainty.toLowerCase()]
        .filter(Boolean)
        .join(" · "),
      professional: d.doctor?.name ?? null,
      encounterId: d.encounterId,
      severity: d.kind === "PRINCIPAL" ? "AVISO" : "INFO",
      badge: d.certainty,
    });
  }

  for (const v of vitals) {
    const flags = flagVitals(v);
    const parts: string[] = [];
    if (v.systolic && v.diastolic) parts.push(`PA ${v.systolic}/${v.diastolic} mmHg`);
    if (v.heartRate) parts.push(`FC ${v.heartRate} bpm`);
    if (v.respiratoryRate) parts.push(`FR ${v.respiratoryRate} cpm`);
    if (v.temperature) parts.push(`T ${v.temperature} °C`);
    if (v.oxygenSaturation) parts.push(`SpO₂ ${v.oxygenSaturation}%`);
    if (v.glucose) parts.push(`Glicemia ${v.glucose} mg/dL`);
    if (v.weightKg) parts.push(`Peso ${v.weightKg} kg`);
    if (v.bmi) parts.push(`IMC ${v.bmi}`);
    if (v.painScore !== null && v.painScore !== undefined) parts.push(`Dor ${v.painScore}/10`);
    events.push({
      id: `vital:${v.id}`,
      type: "SINAIS_VITAIS",
      at: v.recordedAt.toISOString(),
      title: "Sinais vitais",
      summary: parts.join(" · ") || null,
      professional: v.recordedBy?.name ?? null,
      encounterId: v.encounterId,
      severity: flags.some((f) => f.severity === "CRITICO") ? "CRITICO" : flags.length ? "AVISO" : "INFO",
    });
  }

  for (const a of allergies) {
    events.push({
      id: `allergy:${a.id}`,
      type: "ALERGIA",
      at: a.createdAt.toISOString(),
      title: `Alergia registada: ${a.substance}`,
      summary: a.reaction,
      professional: a.doctor?.name ?? null,
      severity: a.status === "ACTIVA" && (a.severity === "GRAVE" || a.severity === "FATAL") ? "CRITICO" : "AVISO",
      badge: a.severity,
    });
  }

  for (const p of prescriptions) {
    events.push({
      id: `prescription:${p.id}`,
      type: "PRESCRICAO",
      at: p.issuedAt.toISOString(),
      title: `Receita ${p.number}`,
      summary: p.items.map((i) => [i.medicationName, i.dose && `${i.dose}${i.doseUnit ?? ""}`, i.frequency].filter(Boolean).join(" ")).join("; ") || null,
      professional: p.doctor?.name ?? null,
      encounterId: p.encounterId,
      badge: p.status,
    });
  }

  for (const o of orders) {
    events.push({
      id: `order:${o.id}`,
      type: "EXAME",
      at: o.requestedAt.toISOString(),
      title: `${o.name}`,
      summary: `${o.category.toLowerCase()} · prioridade ${o.priority.toLowerCase()} · ${o.number}`,
      professional: o.doctor?.name ?? null,
      encounterId: o.encounterId,
      severity: o.priority === "EMERGENTE" ? "CRITICO" : o.priority === "URGENTE" ? "AVISO" : "INFO",
      badge: o.status,
    });
  }

  for (const r of results) {
    const abnormal = r.items.map((i) => `${i.name} ${i.value ?? ""}${i.unit ? ` ${i.unit}` : ""}${i.flag ? ` (${i.flag})` : ""}`);
    events.push({
      id: `result:${r.id}`,
      type: "RESULTADO",
      at: (r.performedAt ?? r.validatedAt ?? new Date(0)).toISOString(),
      title: `Resultado · ${r.order.name}`,
      summary: r.conclusion ?? (abnormal.length ? `Valores alterados: ${abnormal.join("; ")}` : null),
      encounterId: r.order.encounterId,
      severity: abnormal.length ? "AVISO" : "INFO",
      badge: r.validatedAt ? "VALIDADO" : "POR VALIDAR",
    });
  }

  for (const p of procedures) {
    events.push({
      id: `procedure:${p.id}`,
      type: "PROCEDIMENTO",
      at: p.performedAt.toISOString(),
      title: p.name,
      summary: [p.outcome, p.complications ? `Complicações: ${p.complications}` : null].filter(Boolean).join(" · ") || null,
      professional: p.doctor?.name ?? null,
      encounterId: p.encounterId,
      severity: p.complications ? "AVISO" : "INFO",
      badge: p.status,
    });
  }

  for (const t of treatments) {
    events.push({
      id: `treatment:${t.id}`,
      type: "TRATAMENTO",
      at: t.startedAt.toISOString(),
      title: t.name,
      summary: t.plan,
      professional: t.doctor?.name ?? null,
      encounterId: t.encounterId,
      badge: t.status,
    });
  }

  for (const a of admissions) {
    if (wants(filters, "INTERNAMENTO")) {
      events.push({
        id: `admission:${a.id}`,
        type: "INTERNAMENTO",
        at: a.admittedAt.toISOString(),
        title: `Internamento ${a.number}`,
        summary: [a.reason, [a.ward, a.room, a.bed].filter(Boolean).join(" · ")].filter(Boolean).join(" — ") || null,
        professional: a.doctor?.name ?? null,
        encounterId: a.encounterId,
        badge: a.status,
      });
    }
    if (a.dischargedAt && wants(filters, "ALTA")) {
      events.push({
        id: `discharge:${a.id}`,
        type: "ALTA",
        at: a.dischargedAt.toISOString(),
        title: `Alta do internamento ${a.number}`,
        summary: a.dischargeSummary,
        professional: a.doctor?.name ?? null,
        encounterId: a.encounterId,
      });
    }
  }

  for (const d of attachments) {
    events.push({
      id: `attachment:${d.id}`,
      type: "DOCUMENTO",
      at: d.createdAt.toISOString(),
      title: d.name,
      summary: `${d.category.toLowerCase()} · ${d.mimeType} · ${Math.round(d.sizeBytes / 1024)} KB`,
      professional: d.uploadedBy?.name ?? null,
      encounterId: d.encounterId,
    });
  }

  events.sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? 1 : -1));

  const page = events.slice(0, limit);
  const hasMore = events.length > limit;
  return {
    events: page,
    hasMore,
    nextCursor: hasMore && page.length ? page[page.length - 1]!.at : null,
  };
}

export interface ClinicalAlert {
  kind: "ALERGIA" | "DIAGNOSTICO" | "SINAL_VITAL" | "RESULTADO";
  severity: "AVISO" | "CRITICO";
  title: string;
  detail?: string | null;
}

/**
 * Resumo clínico de topo: o que um profissional precisa de ver em segundos —
 * alergias activas, diagnósticos activos, medicação em curso e últimos sinais
 * vitais.
 */
export async function getPatientClinicalSummary(clinicId: string, patientId: string) {
  const [allergies, diagnoses, prescriptions, latestVitals, openOrders, activeAdmission] = await Promise.all([
    prisma.allergy.findMany({
      where: { clinicId, patientId, status: "ACTIVA" },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      select: { id: true, substance: true, severity: true, kind: true, category: true, reaction: true, identifiedAt: true, notes: true },
    }),
    prisma.diagnosis.findMany({
      where: { clinicId, patientId, isActive: true },
      orderBy: [{ kind: "asc" }, { recordedAt: "desc" }],
      take: 10,
      select: { id: true, description: true, code: true, codeSystem: true, kind: true, certainty: true, recordedAt: true, doctor: { select: { name: true } } },
    }),
    prisma.prescription.findMany({
      where: { clinicId, patientId, status: "ACTIVA" },
      orderBy: { issuedAt: "desc" },
      take: 5,
      select: {
        id: true, number: true, issuedAt: true, status: true,
        doctor: { select: { name: true } },
        items: { select: { id: true, medicationName: true, dose: true, doseUnit: true, frequency: true, durationDays: true, route: true, status: true } },
      },
    }),
    prisma.vitalSign.findFirst({
      where: { clinicId, patientId },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.diagnosticOrder.count({ where: { clinicId, patientId, status: { in: ["SOLICITADO", "AGENDADO", "RECOLHIDO", "EM_PROCESSAMENTO"] } } }),
    prisma.admission.findFirst({
      where: { clinicId, patientId, status: "ADMITIDO" },
      orderBy: { admittedAt: "desc" },
      select: { id: true, number: true, admittedAt: true, ward: true, room: true, bed: true, reason: true },
    }),
  ]);

  const alerts: ClinicalAlert[] = [];
  for (const a of allergies) {
    alerts.push({
      kind: "ALERGIA",
      severity: a.severity === "GRAVE" || a.severity === "FATAL" ? "CRITICO" : "AVISO",
      title: `${a.kind === "ALERGIA" ? "Alergia" : "Intolerância"}: ${a.substance}`,
      detail: [a.reaction, `gravidade ${a.severity.toLowerCase()}`].filter(Boolean).join(" · "),
    });
  }
  if (latestVitals) {
    for (const flag of flagVitals(latestVitals)) {
      if (flag.severity !== "CRITICO") continue;
      alerts.push({
        kind: "SINAL_VITAL",
        severity: "CRITICO",
        title: `Sinal vital fora do intervalo (${flag.key})`,
        detail: `Valor ${flag.value} — ${flag.direction.toLowerCase()}`,
      });
    }
  }

  const bmi = latestVitals?.bmi ?? computeBmi(latestVitals?.weightKg, latestVitals?.heightCm);

  return {
    allergies,
    diagnoses,
    prescriptions,
    latestVitals: latestVitals ? { ...latestVitals, bmi, bmiBand: bmiBand(bmi) } : null,
    openOrders,
    activeAdmission,
    alerts,
  };
}

/** Séries temporais de um parâmetro vital, para o gráfico de evolução. */
export async function getVitalSeries(clinicId: string, patientId: string, limit = 60) {
  const rows = await prisma.vitalSign.findMany({
    where: { clinicId, patientId },
    orderBy: { recordedAt: "desc" },
    take: Math.min(limit, 200),
    select: {
      recordedAt: true, systolic: true, diastolic: true, heartRate: true, temperature: true,
      oxygenSaturation: true, weightKg: true, bmi: true, glucose: true, respiratoryRate: true,
    },
  });
  return rows.reverse().map((r) => ({ ...r, at: r.recordedAt.toISOString() }));
}
