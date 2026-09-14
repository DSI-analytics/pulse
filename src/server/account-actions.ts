"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { createSession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTranslator } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";

export type AccountActionState = { ok: boolean; message: string } | null;

const profileSchema = (t: Translator) =>
  z.object({
    name: z.string().trim().min(3, t("account.messages.nameRequired")),
    email: z.string().trim().toLowerCase().email(t("account.messages.emailInvalid")),
  });

const passwordSchema = (t: Translator) =>
  z.object({
    currentPassword: z.string().min(1, t("account.messages.currentRequired")),
    newPassword: z.string().min(8, t("account.messages.newLength")).max(128),
    confirmPassword: z.string().min(1, t("account.messages.confirmRequired")),
  }).refine((values) => values.newPassword === values.confirmPassword, {
    message: t("account.messages.confirmMismatch"),
    path: ["confirmPassword"],
  });

export async function updateOwnProfile(_previous: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const actor = await requireUser();
  const t = await getTranslator();
  const parsed = profileSchema(t).safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    const updated = await prisma.user.update({
      where: { id: actor.userId, clinicId: actor.clinicId },
      data: parsed.data,
      select: { id: true },
    });
    await audit({
      clinicId: actor.clinicId,
      userId: actor.userId,
      action: "account.profile_update",
      entity: "User",
      entityId: updated.id,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: t("account.messages.profileSaved") };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: t("account.messages.emailTaken") };
    }
    return { ok: false, message: t("account.messages.profileFailed") };
  }
}

export async function changeOwnPassword(_previous: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const actor = await requireUser();
  const t = await getTranslator();
  const parsed = passwordSchema(t).safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const current = await prisma.user.findFirst({
    where: { id: actor.userId, clinicId: actor.clinicId, isActive: true },
    select: { id: true, passwordHash: true },
  });
  if (!current || !verifyPassword(parsed.data.currentPassword, current.passwordHash)) {
    return { ok: false, message: t("account.messages.currentWrong") };
  }
  if (verifyPassword(parsed.data.newPassword, current.passwordHash)) {
    return { ok: false, message: t("account.messages.sameAsCurrent") };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: current.id },
      data: { passwordHash: hashPassword(parsed.data.newPassword), sessionVersion: { increment: 1 } },
      select: {
        id: true, clinicId: true, role: true, name: true, email: true, sessionVersion: true,
        doctor: { select: { id: true } },
      },
    });
    await tx.passwordResetCode.updateMany({
      where: { userId: current.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return user;
  });

  await createSession({
    userId: updated.id,
    clinicId: updated.clinicId,
    role: updated.role,
    name: updated.name,
    email: updated.email,
    doctorId: updated.doctor?.id ?? null,
    sessionVersion: updated.sessionVersion,
  });
  await audit({
    clinicId: actor.clinicId,
    userId: actor.userId,
    action: "account.password_change",
    entity: "User",
    entityId: actor.userId,
  });
  return { ok: true, message: t("account.messages.passwordChanged") };
}
