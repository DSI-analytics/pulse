"use server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { sendPasswordResetCode } from "@/lib/email";
import {
  generateResetCode,
  hashResetCode,
  resetCodesMatch,
  RESET_CODE_MAX_ATTEMPTS,
  RESET_CODE_RESEND_SECONDS,
  RESET_CODE_TTL_MINUTES,
} from "@/lib/password-reset";
import { getTranslator } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";

export type RequestResetState = { status?: "sent"; email?: string; error?: string } | null;
export type ConfirmResetState = { status?: "reset"; error?: string } | null;

const requestSchema = (t: Translator) =>
  z.object({ email: z.string().trim().toLowerCase().email(t("auth.errors.enterValidEmail")) });
const confirmSchema = (t: Translator) =>
  z.object({
    email: z.string().trim().toLowerCase().email(),
    code: z.string().trim().regex(/^\d{6}$/, t("auth.errors.codeFormat")),
    password: z.string().min(8, t("auth.errors.passwordLength")).max(72),
    passwordConfirmation: z.string(),
  }).refine((values) => values.password === values.passwordConfirmation, {
    message: t("auth.errors.passwordMismatch"), path: ["passwordConfirmation"],
  });

function resetSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET em falta ou demasiado curto.");
  return value;
}

export async function requestPasswordReset(_previous: RequestResetState, formData: FormData): Promise<RequestResetState> {
  const t = await getTranslator();
  const parsed = requestSchema(t).safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const email = parsed.data.email;
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, clinicId: true, name: true, email: true },
  });

  // Use the same response for unknown addresses to avoid account enumeration.
  if (!user) return { status: "sent", email };

  const resendAfter = new Date(Date.now() - RESET_CODE_RESEND_SECONDS * 1_000);
  const recent = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id, consumedAt: null, createdAt: { gte: resendAfter } },
    select: { id: true },
  });
  if (recent) return { status: "sent", email };

  const code = generateResetCode();
  const reset = await prisma.$transaction(async (tx) => {
    await tx.passwordResetCode.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return tx.passwordResetCode.create({
      data: {
        userId: user.id,
        codeHash: hashResetCode(code, user.id, resetSecret()),
        expiresAt: new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000),
      },
      select: { id: true },
    });
  });

  try {
    await sendPasswordResetCode({ to: user.email, name: user.name, code });
  } catch (error) {
    await prisma.passwordResetCode.delete({ where: { id: reset.id } }).catch(() => undefined);
    console.error("Falha ao enviar código de recuperação:", error instanceof Error ? error.message : "erro desconhecido");
    return { error: t("auth.errors.sendFailed") };
  }

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "user.password_reset_requested",
    entity: "User",
    entityId: user.id,
  });
  return { status: "sent", email };
}

export async function confirmPasswordReset(_previous: ConfirmResetState, formData: FormData): Promise<ConfirmResetState> {
  const t = await getTranslator();
  const parsed = confirmSchema(t).safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, clinicId: true },
  });
  if (!user) return { error: t("auth.errors.codeInvalidOrExpired") };

  const reset = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!reset || reset.expiresAt <= new Date() || reset.attempts >= RESET_CODE_MAX_ATTEMPTS) {
    return { error: t("auth.errors.codeInvalidOrExpiredRetry") };
  }

  if (!resetCodesMatch(parsed.data.code, reset.codeHash, user.id, resetSecret())) {
    await prisma.passwordResetCode.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
    const remaining = Math.max(0, RESET_CODE_MAX_ATTEMPTS - reset.attempts - 1);
    return { error: remaining ? t("auth.errors.codeInvalidRemaining", { remaining }) : t("auth.errors.codeBlocked") };
  }

  const consumedAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetCode.updateMany({
      where: { id: reset.id, consumedAt: null, expiresAt: { gt: consumedAt }, attempts: { lt: RESET_CODE_MAX_ATTEMPTS } },
      data: { consumedAt },
    });
    if (claimed.count !== 1) return false;
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(parsed.data.password), sessionVersion: { increment: 1 } },
    });
    await tx.passwordResetCode.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt },
    });
    return true;
  });
  if (!result) return { error: t("auth.errors.codeInvalidOrExpiredRetry") };

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "user.password_reset_completed",
    entity: "User",
    entityId: user.id,
  });
  return { status: "reset" };
}
