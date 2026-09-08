"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { createSession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AccountActionState = { ok: boolean; message: string } | null;

const profileSchema = z.object({
  name: z.string().trim().min(3, "Indique o nome completo."),
  email: z.string().trim().toLowerCase().email("Indique um email válido."),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Introduza a palavra-passe atual."),
  newPassword: z.string().min(8, "A nova palavra-passe deve ter pelo menos 8 caracteres.").max(128),
  confirmPassword: z.string().min(1, "Confirme a nova palavra-passe."),
}).refine((values) => values.newPassword === values.confirmPassword, {
  message: "A confirmação não corresponde à nova palavra-passe.",
  path: ["confirmPassword"],
});

export async function updateOwnProfile(_previous: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const actor = await requireUser();
  const parsed = profileSchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
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
    return { ok: true, message: "Dados pessoais atualizados." };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "Já existe um utilizador com esse email nesta clínica." };
    }
    return { ok: false, message: "Não foi possível atualizar os dados. Tente novamente." };
  }
}

export async function changeOwnPassword(_previous: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const actor = await requireUser();
  const parsed = passwordSchema.safeParse({
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
    return { ok: false, message: "A palavra-passe atual está incorreta." };
  }
  if (verifyPassword(parsed.data.newPassword, current.passwordHash)) {
    return { ok: false, message: "A nova palavra-passe deve ser diferente da atual." };
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
  return { ok: true, message: "Palavra-passe alterada. As outras sessões foram terminadas." };
}
