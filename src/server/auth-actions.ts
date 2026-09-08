"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, getSession, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clientIp, consume, reset } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Introduza a palavra-passe"),
});

/**
 * Mensagem única para credenciais erradas, conta inexistente e conta inactiva.
 * Distinguir os casos permitiria enumerar contas válidas (§29).
 */
const GENERIC_ERROR = "Credenciais inválidas.";

/** Janela e limites da protecção contra força bruta. */
const WINDOW_MS = 15 * 60_000;
const MAX_PER_ACCOUNT = 8;
const MAX_PER_IP = 30;

async function recordAttempt(email: string, ip: string | null, success: boolean, userId?: string | null) {
  try {
    await prisma.loginAttempt.create({ data: { email, ipAddress: ip, success, userId: userId ?? null } });
  } catch {
    // Nunca bloquear a autenticação por falha no registo da tentativa.
  }
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 512) ?? null;

  // Duas barreiras: por conta (trava a adivinhação de uma palavra-passe) e por
  // IP (trava a varredura de muitas contas a partir da mesma origem).
  const byAccount = consume(`login:acct:${email}`, MAX_PER_ACCOUNT, WINDOW_MS);
  const byIp = consume(`login:ip:${ip}`, MAX_PER_IP, WINDOW_MS);
  if (!byAccount.allowed || !byIp.allowed) {
    const retry = Math.max(byAccount.retryAfterSeconds, byIp.retryAfterSeconds);
    await recordAttempt(email, ip, false);
    const blocked = await prisma.user.findFirst({ where: { email }, select: { id: true, clinicId: true } });
    if (blocked) {
      await audit({
        clinicId: blocked.clinicId,
        userId: null,
        action: "auth.login.blocked",
        module: "autenticacao",
        entity: "User",
        entityId: blocked.id,
        result: "NEGADO",
        request: { ipAddress: ip, userAgent, endpoint: "/login", httpMethod: "POST" },
        metadata: { reason: "rate_limit" },
      });
    }
    return { error: `Demasiadas tentativas. Tente novamente dentro de ${Math.ceil(retry / 60)} minuto(s).` };
  }

  // O mesmo e-mail pode existir em clínicas diferentes (`@@unique([clinicId,
  // email])`); a conta activa tem precedência.
  const user = await prisma.user.findFirst({
    where: { email },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    include: { doctor: { select: { id: true } } },
  });

  const passwordOk = user ? verifyPassword(parsed.data.password, user.passwordHash) : false;

  if (!user || !passwordOk || !user.isActive) {
    await recordAttempt(email, ip, false, user?.id);
    if (user) {
      await audit({
        clinicId: user.clinicId,
        userId: null,
        userName: user.name,
        action: passwordOk ? "auth.login.inactive" : "auth.login.failed",
        module: "autenticacao",
        entity: "User",
        entityId: user.id,
        result: "FALHA",
        request: { ipAddress: ip, userAgent, endpoint: "/login", httpMethod: "POST" },
      });
    }
    return { error: GENERIC_ERROR };
  }

  reset(`login:acct:${email}`);
  await recordAttempt(email, ip, true, user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const sessionId = crypto.randomUUID();
  await createSession({
    userId: user.id,
    clinicId: user.clinicId,
    role: user.role,
    name: user.name,
    email: user.email,
    doctorId: user.doctor?.id ?? null,
    sessionVersion: user.sessionVersion,
    sessionId,
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    sessionId,
    action: "auth.login",
    module: "autenticacao",
    entity: "User",
    entityId: user.id,
    request: { ipAddress: ip, userAgent, endpoint: "/login", httpMethod: "POST" },
  });

  redirect("/");
}

export async function logoutAction() {
  const session = await getSession();
  if (session) {
    await audit({
      clinicId: session.clinicId,
      userId: session.userId,
      userName: session.name,
      userRole: session.role,
      sessionId: session.sessionId ?? null,
      action: "auth.logout",
      module: "autenticacao",
      entity: "User",
      entityId: session.userId,
    });
  }
  await destroySession();
  redirect("/login");
}
