"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Introduza a palavra-passe"),
});

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email.toLowerCase().trim(), isActive: true },
    include: { doctor: { select: { id: true } } },
  });

  // Constant-ish response to avoid leaking which emails exist.
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return { error: "Credenciais inválidas." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession({
    userId: user.id,
    clinicId: user.clinicId,
    role: user.role,
    name: user.name,
    email: user.email,
    doctorId: user.doctor?.id ?? null,
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "user.login", entity: "User", entityId: user.id });

  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
