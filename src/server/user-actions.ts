"use server";

import { Prisma, type UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { hashPassword, requireUser, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ADMINISTRATIVE_ROLES, can } from "@/lib/rbac";
import { getTranslator } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";

const ROLES = [
  "SUPER_ADMIN",
  "CLINIC_ADMIN",
  "CLINIC_MANAGER",
  "RECEPTIONIST",
  "DOCTOR",
  "NURSE",
  "LAB_TECHNICIAN",
  "PHARMACIST",
  "FINANCE",
  "INVENTORY_MANAGER",
] as const;
const ADMIN_ROLES: UserRole[] = ADMINISTRATIVE_ROLES;

const userSchema = (t: Translator) =>
  z.object({
    name: z.string().trim().min(3, t("users.errors.nameRequired")),
    email: z.string().trim().toLowerCase().email(t("users.errors.emailInvalid")),
    role: z.enum(ROLES, { error: t("users.errors.roleInvalid") }),
    doctorId: z.string().trim().optional().default(""),
  });

type UserValues = z.input<ReturnType<typeof userSchema>>;
export type UserActionResult = { ok: true; password?: string } | { error: string };

type GuardResult = { ok: true; actor: SessionUser; t: Translator } | { ok: false; error: string };

async function guard(): Promise<GuardResult> {
  const actor = await requireUser();
  const t = await getTranslator();
  if (!can(actor.role, "user.manage")) return { ok: false, error: t("users.errors.noPermission") };
  return { ok: true, actor, t };
}

function defaultPassword(): string | null {
  const password = process.env.DEFAULT_USER_PASSWORD?.trim() || (process.env.NODE_ENV === "production" ? "" : "pulso123");
  return password.length >= 8 ? password : null;
}

function prismaMessage(error: unknown, t: Translator): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return t("users.errors.emailTaken");
  }
  return t("users.errors.saveFailed");
}

type DoctorResult = { ok: true; doctorId: string | null } | { ok: false; error: string };

async function validateDoctor(t: Translator, clinicId: string, doctorId: string, userId?: string): Promise<DoctorResult> {
  if (!doctorId) return { ok: true, doctorId: null };
  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, clinicId },
    select: { id: true, userId: true },
  });
  if (!doctor) return { ok: false, error: t("users.errors.doctorOtherClinic") };
  if (doctor.userId && doctor.userId !== userId) {
    return { ok: false, error: t("users.errors.doctorTaken") };
  }
  return { ok: true, doctorId: doctor.id };
}

function canManageTarget(actorRole: UserRole, targetRole: UserRole) {
  return actorRole === "SUPER_ADMIN" || targetRole !== "SUPER_ADMIN";
}

async function ensureAdminRemains(t: Translator, clinicId: string, target: { role: UserRole; isActive: boolean }, next: { role: UserRole; isActive: boolean }) {
  const removesActiveAdmin = target.isActive && ADMIN_ROLES.includes(target.role) && (!next.isActive || !ADMIN_ROLES.includes(next.role));
  if (!removesActiveAdmin) return null;
  const activeAdmins = await prisma.user.count({ where: { clinicId, isActive: true, role: { in: ADMIN_ROLES } } });
  return activeAdmins <= 1 ? t("users.errors.lastAdmin") : null;
}

export async function createUser(values: UserValues): Promise<UserActionResult> {
  const access = await guard();
  if (!access.ok) return { error: access.error };
  const { t } = access;
  const parsed = userSchema(t).safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!canManageTarget(access.actor.role, parsed.data.role)) return { error: t("users.errors.superAdminCreate") };

  const password = defaultPassword();
  if (!password) return { error: t("users.errors.defaultPassword") };
  const doctor = await validateDoctor(t, access.actor.clinicId, parsed.data.doctorId);
  if (!doctor.ok) return { error: doctor.error };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          clinicId: access.actor.clinicId,
          name: parsed.data.name,
          email: parsed.data.email,
          role: parsed.data.role,
          passwordHash: hashPassword(password),
        },
        select: { id: true },
      });
      if (doctor.doctorId) await tx.doctor.update({ where: { id: doctor.doctorId }, data: { userId: user.id } });
      return user;
    });
    await audit({
      clinicId: access.actor.clinicId,
      userId: access.actor.userId,
      action: "user.create",
      entity: "User",
      entityId: created.id,
      metadata: { role: parsed.data.role, doctorId: doctor.doctorId },
    });
    revalidatePath("/configuracoes");
    return { ok: true, password };
  } catch (error) {
    return { error: prismaMessage(error, t) };
  }
}

export async function updateUser(id: string, values: UserValues): Promise<UserActionResult> {
  const access = await guard();
  if (!access.ok) return { error: access.error };
  const { t } = access;
  const parsed = userSchema(t).safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const target = await prisma.user.findFirst({
    where: { id, clinicId: access.actor.clinicId },
    select: { id: true, role: true, isActive: true, doctor: { select: { id: true } } },
  });
  if (!target) return { error: t("users.errors.notFound") };
  if (!canManageTarget(access.actor.role, target.role) || !canManageTarget(access.actor.role, parsed.data.role)) {
    return { error: t("users.errors.superAdminRoles") };
  }
  if (target.id === access.actor.userId && parsed.data.role !== target.role) {
    return { error: t("users.errors.ownRole") };
  }
  const adminError = await ensureAdminRemains(t, access.actor.clinicId, target, { role: parsed.data.role, isActive: target.isActive });
  if (adminError) return { error: adminError };
  const doctor = await validateDoctor(t, access.actor.clinicId, parsed.data.doctorId, target.id);
  if (!doctor.ok) return { error: doctor.error };

  try {
    await prisma.$transaction(async (tx) => {
      if (target.doctor?.id && target.doctor.id !== doctor.doctorId) {
        await tx.doctor.update({ where: { id: target.doctor.id }, data: { userId: null } });
      }
      await tx.user.update({
        where: { id: target.id },
        data: { name: parsed.data.name, email: parsed.data.email, role: parsed.data.role },
      });
      if (doctor.doctorId && doctor.doctorId !== target.doctor?.id) {
        await tx.doctor.update({ where: { id: doctor.doctorId }, data: { userId: target.id } });
      }
    });
    await audit({
      clinicId: access.actor.clinicId,
      userId: access.actor.userId,
      action: "user.update",
      entity: "User",
      entityId: target.id,
      metadata: { role: parsed.data.role, doctorId: doctor.doctorId },
    });
    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (error) {
    return { error: prismaMessage(error, t) };
  }
}

export async function setUserActive(id: string, isActive: boolean): Promise<UserActionResult> {
  const access = await guard();
  if (!access.ok) return { error: access.error };
  const { t } = access;
  const target = await prisma.user.findFirst({
    where: { id, clinicId: access.actor.clinicId },
    select: { id: true, role: true, isActive: true },
  });
  if (!target) return { error: t("users.errors.notFound") };
  if (!canManageTarget(access.actor.role, target.role)) return { error: t("users.errors.superAdminUser") };
  if (target.id === access.actor.userId && !isActive) return { error: t("users.errors.ownDeactivate") };
  const adminError = await ensureAdminRemains(t, access.actor.clinicId, target, { role: target.role, isActive });
  if (adminError) return { error: adminError };

  await prisma.user.update({ where: { id: target.id }, data: { isActive } });
  await audit({
    clinicId: access.actor.clinicId,
    userId: access.actor.userId,
    action: isActive ? "user.activate" : "user.deactivate",
    entity: "User",
    entityId: target.id,
  });
  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function resetUserPassword(id: string): Promise<UserActionResult> {
  const access = await guard();
  if (!access.ok) return { error: access.error };
  const { t } = access;
  const target = await prisma.user.findFirst({
    where: { id, clinicId: access.actor.clinicId },
    select: { id: true, role: true },
  });
  if (!target) return { error: t("users.errors.notFound") };
  if (!canManageTarget(access.actor.role, target.role)) return { error: t("users.errors.superAdminUser") };
  const password = defaultPassword();
  if (!password) return { error: t("users.errors.defaultPassword") };

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: hashPassword(password), sessionVersion: { increment: 1 } },
  });
  await audit({
    clinicId: access.actor.clinicId,
    userId: access.actor.userId,
    action: "user.password_reset",
    entity: "User",
    entityId: target.id,
  });
  return { ok: true, password };
}
