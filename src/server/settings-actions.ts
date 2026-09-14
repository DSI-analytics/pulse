"use server";

import { randomBytes } from "node:crypto";
import { Prisma, TextSizePreference, ThemePreference } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ALLOWED_API_SCOPES } from "@/lib/api-scopes";
import { audit } from "@/lib/audit";
import { requireUser, type SessionUser } from "@/lib/auth";
import { hashToken } from "@/lib/fhir/auth";
import { isValidCurrency, isValidTimeZone, parseMoneyInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { isLocale } from "@/i18n/config";
import { getTranslator } from "@/i18n/server";

/**
 * Acções das Configurações.
 *
 * Todas validam a sessão e a permissão NO SERVIDOR, limitam as escritas à
 * clínica da pessoa e deixam registo na auditoria. As mensagens devolvidas
 * vêm no idioma de quem fez o pedido.
 */

export type SettingsActionState = { ok: boolean; message: string; token?: string } | null;

type Guarded = { user: SessionUser } | { denied: SettingsActionState };

async function guardSettings(): Promise<Guarded> {
  const user = await requireUser();
  if (!can(user.role, "settings.manage")) {
    const t = await getTranslator();
    return { denied: { ok: false, message: t("common.noPermission") } };
  }
  return { user };
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const optional = (value: string) => (value === "" ? null : value);

function refreshSettings(section?: string) {
  revalidatePath("/configuracoes");
  if (section) revalidatePath(`/configuracoes/${section}`);
}

// ── Aparência (cada utilizador) ──────────────────────────────────────────

const appearanceSchema = z.object({
  theme: z.enum(ThemePreference),
  textSize: z.enum(TextSizePreference),
  reduceMotion: z.boolean(),
  locale: z.string().nullable(),
});

export async function updateAppearance(input: z.input<typeof appearanceSchema>): Promise<SettingsActionState> {
  const user = await requireUser();
  const parsed = appearanceSchema.safeParse(input);
  if (!parsed.success || (parsed.data.locale !== null && !isLocale(parsed.data.locale))) {
    const t = await getTranslator();
    return { ok: false, message: t("common.genericError") };
  }

  const before = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { theme: true, textSize: true, reduceMotion: true, locale: true },
  });
  await prisma.user.update({ where: { id: user.userId, clinicId: user.clinicId }, data: parsed.data });
  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    action: "account.preferences_update",
    entity: "User",
    entityId: user.userId,
    before: before ?? undefined,
    after: parsed.data,
  });

  // O layout raiz lê as preferências: idioma e tema mudam em toda a app.
  revalidatePath("/", "layout");
  const t = await getTranslator();
  return { ok: true, message: t("settings.appearance.saved") };
}

/** Atalho do botão de tema do cabeçalho. */
export async function setThemePreference(theme: ThemePreference): Promise<void> {
  const user = await requireUser();
  if (!Object.values(ThemePreference).includes(theme)) return;
  await prisma.user.update({ where: { id: user.userId, clinicId: user.clinicId }, data: { theme } });
  revalidatePath("/", "layout");
}

// ── Dados da clínica ─────────────────────────────────────────────────────

export async function updateClinicProfile(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const guarded = await guardSettings();
  if ("denied" in guarded) return guarded.denied;
  const { user } = guarded;
  const t = await getTranslator();

  const schema = z.object({
    name: z.string().min(2, t("settings.clinic.errors.name")).max(160),
    nuit: z.string().max(30),
    phone: z.string().max(40),
    email: z.union([z.literal(""), z.email(t("settings.clinic.errors.email"))]),
    address: z.string().max(240),
    city: z.string().max(80),
    country: z.string().max(80),
    timezone: z.string().refine(isValidTimeZone, t("settings.clinic.errors.timezone")),
  });
  const parsed = schema.safeParse({
    name: text(formData, "name"),
    nuit: text(formData, "nuit"),
    phone: text(formData, "phone"),
    email: text(formData, "email").toLowerCase(),
    address: text(formData, "address"),
    city: text(formData, "city"),
    country: text(formData, "country"),
    timezone: text(formData, "timezone"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const data = {
    name: parsed.data.name,
    nuit: optional(parsed.data.nuit),
    phone: optional(parsed.data.phone),
    email: optional(parsed.data.email),
    address: optional(parsed.data.address),
    city: parsed.data.city || "Maputo",
    country: parsed.data.country || "Moçambique",
    timezone: parsed.data.timezone,
  };
  const before = await prisma.clinic.findUnique({
    where: { id: user.clinicId },
    select: { name: true, nuit: true, phone: true, email: true, address: true, city: true, country: true, timezone: true },
  });
  await prisma.clinic.update({ where: { id: user.clinicId }, data });
  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    action: "clinic.update",
    entity: "Clinic",
    entityId: user.clinicId,
    before: before ?? undefined,
    after: data,
  });

  revalidatePath("/", "layout");
  return { ok: true, message: t("settings.clinic.saved") };
}

// ── Filiais ──────────────────────────────────────────────────────────────

export async function saveBranch(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const guarded = await guardSettings();
  if ("denied" in guarded) return guarded.denied;
  const { user } = guarded;
  const t = await getTranslator();

  const id = text(formData, "id");
  const name = text(formData, "name");
  if (name.length < 2) return { ok: false, message: t("settings.clinic.errors.branchName") };
  const data = { name, address: optional(text(formData, "address")), phone: optional(text(formData, "phone")) };

  const duplicate = await prisma.branch.findFirst({
    where: { clinicId: user.clinicId, name: { equals: name, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (duplicate) return { ok: false, message: t("settings.clinic.errors.branchDuplicate") };

  if (id) {
    const existing = await prisma.branch.findFirst({ where: { id, clinicId: user.clinicId } });
    if (!existing) return { ok: false, message: t("common.genericError") };
    await prisma.branch.update({ where: { id }, data });
    await audit({
      clinicId: user.clinicId, userId: user.userId, action: "branch.update", entity: "Branch", entityId: id,
      before: { name: existing.name, address: existing.address, phone: existing.phone }, after: data,
    });
  } else {
    const hasBranches = await prisma.branch.count({ where: { clinicId: user.clinicId } });
    const created = await prisma.branch.create({
      data: { ...data, clinicId: user.clinicId, isMain: hasBranches === 0 },
      select: { id: true },
    });
    await audit({ clinicId: user.clinicId, userId: user.userId, action: "branch.create", entity: "Branch", entityId: created.id, after: data });
  }

  refreshSettings("clinica");
  return { ok: true, message: t("settings.clinic.branchSaved") };
}

export async function setMainBranch(id: string): Promise<SettingsActionState> {
  const guarded = await guardSettings();
  if ("denied" in guarded) return guarded.denied;
  const { user } = guarded;
  const t = await getTranslator();

  const branch = await prisma.branch.findFirst({ where: { id, clinicId: user.clinicId }, select: { id: true } });
  if (!branch) return { ok: false, message: t("common.genericError") };
  await prisma.$transaction([
    prisma.branch.updateMany({ where: { clinicId: user.clinicId, isMain: true }, data: { isMain: false } }),
    prisma.branch.update({ where: { id: branch.id }, data: { isMain: true } }),
  ]);
  await audit({ clinicId: user.clinicId, userId: user.userId, action: "branch.set_main", entity: "Branch", entityId: branch.id });

  refreshSettings("clinica");
  return { ok: true, message: t("settings.clinic.branchSaved") };
}

export async function deleteBranch(id: string): Promise<SettingsActionState> {
  const guarded = await guardSettings();
  if ("denied" in guarded) return guarded.denied;
  const { user } = guarded;
  const t = await getTranslator();

  const branch = await prisma.branch.findFirst({
    where: { id, clinicId: user.clinicId },
    select: { id: true, name: true, isMain: true, _count: { select: { doctors: true, appointments: true, encounters: true } } },
  });
  if (!branch) return { ok: false, message: t("common.genericError") };
  if (branch.isMain) return { ok: false, message: t("settings.clinic.errors.branchMain") };
  // Nunca apagar dados operacionais: só filiais sem nada associado.
  if (branch._count.doctors + branch._count.appointments + branch._count.encounters > 0) {
    return { ok: false, message: t("settings.clinic.errors.branchInUse") };
  }

  await prisma.branch.delete({ where: { id: branch.id } });
  await audit({
    clinicId: user.clinicId, userId: user.userId, action: "branch.delete", entity: "Branch", entityId: branch.id,
    before: { name: branch.name },
  });

  refreshSettings("clinica");
  return { ok: true, message: t("settings.clinic.branchDeleted") };
}

// ── Moeda e idioma ───────────────────────────────────────────────────────

export async function updateRegionalSettings(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const guarded = await guardSettings();
  if ("denied" in guarded) return guarded.denied;
  const { user } = guarded;
  const t = await getTranslator();

  const currency = text(formData, "currency").toUpperCase();
  const locale = text(formData, "locale");
  if (!isValidCurrency(currency)) return { ok: false, message: t("settings.regional.errors.currency") };
  if (!isLocale(locale)) return { ok: false, message: t("settings.regional.errors.locale") };

  const before = await prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { currency: true, locale: true } });
  await prisma.clinic.update({ where: { id: user.clinicId }, data: { currency, locale } });
  await audit({
    clinicId: user.clinicId, userId: user.userId, action: "clinic.regional_update", entity: "Clinic", entityId: user.clinicId,
    before: before ?? undefined, after: { currency, locale },
  });

  revalidatePath("/", "layout");
  // O idioma pode ter mudado: a mensagem sai no idioma novo quando aplicável.
  const next = await getTranslator();
  return { ok: true, message: next("settings.regional.saved") };
}

// ── Agenda e alertas ─────────────────────────────────────────────────────

export async function updateScheduleSettings(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const guarded = await guardSettings();
  if ("denied" in guarded) return guarded.denied;
  const { user } = guarded;
  const t = await getTranslator();

  const days = z.coerce.number().int().min(1, t("settings.schedule.errors.days")).max(365, t("settings.schedule.errors.days"));
  const schema = z.object({
    defaultSlotMinutes: z.coerce
      .number()
      .int()
      .min(5, t("settings.schedule.errors.slotMinutes"))
      .max(240, t("settings.schedule.errors.slotMinutes")),
    lowStockLeadDays: days,
    expiryWarningDays: days,
    receivableOverdueDays: days,
  });
  const parsed = schema.safeParse({
    defaultSlotMinutes: text(formData, "defaultSlotMinutes"),
    lowStockLeadDays: text(formData, "lowStockLeadDays"),
    expiryWarningDays: text(formData, "expiryWarningDays"),
    receivableOverdueDays: text(formData, "receivableOverdueDays"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const fee = parseMoneyInput(text(formData, "defaultConsultationFee"));
  if (fee === null || fee < 0 || fee > 100_000_000_00) return { ok: false, message: t("settings.schedule.errors.fee") };

  const data = { ...parsed.data, defaultConsultationFee: fee };
  const before = await prisma.clinicSettings.findUnique({
    where: { clinicId: user.clinicId },
    select: { defaultSlotMinutes: true, defaultConsultationFee: true, lowStockLeadDays: true, expiryWarningDays: true, receivableOverdueDays: true },
  });
  await prisma.clinicSettings.upsert({
    where: { clinicId: user.clinicId },
    update: data,
    create: { ...data, clinicId: user.clinicId },
  });
  await audit({
    clinicId: user.clinicId, userId: user.userId, action: "clinic.settings_update", entity: "ClinicSettings", entityId: user.clinicId,
    before: before ?? undefined, after: data,
  });

  refreshSettings("agenda-e-alertas");
  revalidatePath("/", "layout");
  return { ok: true, message: t("settings.schedule.saved") };
}

// ── Clientes da API ──────────────────────────────────────────────────────

export async function createApiClient(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const guarded = await guardSettings();
  if ("denied" in guarded) return guarded.denied;
  const { user } = guarded;
  const t = await getTranslator();

  const name = text(formData, "name");
  if (name.length < 2 || name.length > 120) return { ok: false, message: t("settings.integrations.errors.name") };

  const scopes = formData.getAll("scopes").map(String).filter((scope) => ALLOWED_API_SCOPES.includes(scope));
  if (scopes.length === 0) return { ok: false, message: t("settings.integrations.errors.scopes") };

  const expiresRaw = text(formData, "expiresAt");
  let expiresAt: Date | null = null;
  if (expiresRaw) {
    expiresAt = new Date(`${expiresRaw}T23:59:59Z`);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      return { ok: false, message: t("settings.integrations.errors.expiry") };
    }
  }

  // O token só existe nesta resposta; na base de dados fica apenas o hash.
  const token = `pulso_${randomBytes(32).toString("base64url")}`;
  try {
    const client = await prisma.apiClient.create({
      data: { clinicId: user.clinicId, name, scopes: Array.from(new Set(scopes)), expiresAt, tokenHash: hashToken(token) },
      select: { id: true },
    });
    await audit({
      clinicId: user.clinicId, userId: user.userId, action: "api_client.create", entity: "ApiClient", entityId: client.id,
      after: { name, scopes, expiresAt: expiresAt?.toISOString() ?? null },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: t("settings.integrations.errors.duplicate") };
    }
    return { ok: false, message: t("common.genericError") };
  }

  refreshSettings("integracoes");
  return { ok: true, message: t("settings.integrations.tokenTitle"), token };
}

export async function revokeApiClient(id: string): Promise<SettingsActionState> {
  const guarded = await guardSettings();
  if ("denied" in guarded) return guarded.denied;
  const { user } = guarded;
  const t = await getTranslator();

  const client = await prisma.apiClient.findFirst({ where: { id, clinicId: user.clinicId }, select: { id: true, name: true, isActive: true } });
  if (!client) return { ok: false, message: t("common.genericError") };
  if (client.isActive) {
    await prisma.apiClient.update({ where: { id: client.id }, data: { isActive: false } });
    await audit({
      clinicId: user.clinicId, userId: user.userId, action: "api_client.revoke", entity: "ApiClient", entityId: client.id,
      before: { isActive: true }, after: { isActive: false }, metadata: { name: client.name },
    });
  }

  refreshSettings("integracoes");
  return { ok: true, message: t("settings.integrations.revokedToast") };
}
