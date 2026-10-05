import { randomUUID } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth";
import { createDoctorMobileToken, DOCTOR_MOBILE_TOKEN_SECONDS, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { prisma } from "@/lib/prisma";
import { clientIp, consume, reset } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(256) });
const WINDOW_MS = 15 * 60_000;

async function recordAttempt(email: string, ip: string, success: boolean, userId?: string) {
  try {
    await prisma.loginAttempt.create({ data: { email, ipAddress: ip, success, userId } });
  } catch {
    // O registo de auditoria não deve impedir a autenticação.
  }
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateMobileJson({ error: "E-mail ou palavra-passe inválidos." }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const ip = clientIp(request.headers);
  const accountLimit = consume(`mobile-login:acct:${email}`, 8, WINDOW_MS);
  const ipLimit = consume(`mobile-login:ip:${ip}`, 30, WINDOW_MS);
  if (!accountLimit.allowed || !ipLimit.allowed) {
    await recordAttempt(email, ip, false);
    const retryAfter = Math.max(accountLimit.retryAfterSeconds, ipLimit.retryAfterSeconds);
    return privateMobileJson(
      { error: `Demasiadas tentativas. Tente novamente dentro de ${Math.max(1, Math.ceil(retryAfter / 60))} minuto(s).` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const user = await prisma.user.findFirst({
    where: { email, role: "DOCTOR" },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true, clinicId: true, name: true, email: true, passwordHash: true,
      isActive: true, sessionVersion: true,
      doctor: { select: { id: true, status: true } },
    },
  });
  const passwordOk = user ? verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !passwordOk || !user.isActive || !user.doctor || user.doctor.status !== "ACTIVO") {
    await recordAttempt(email, ip, false, user?.id);
    if (user) {
      await audit({
        clinicId: user.clinicId, userId: null, userName: user.name,
        action: "auth.mobile.login.failed", module: "autenticacao", entity: "User", entityId: user.id,
        result: "FALHA", request: { ipAddress: ip, userAgent: request.headers.get("user-agent"), endpoint: "/api/doctor/v1/auth/login", httpMethod: "POST" },
      });
    }
    return privateMobileJson({ error: "E-mail ou palavra-passe inválidos." }, { status: 401 });
  }

  reset(`mobile-login:acct:${email}`);
  await recordAttempt(email, ip, true, user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const sessionId = randomUUID();
  const token = await createDoctorMobileToken({
    userId: user.id, clinicId: user.clinicId, doctorId: user.doctor.id, role: "DOCTOR",
    name: user.name, email: user.email, sessionVersion: user.sessionVersion, sessionId,
  });
  await audit({
    clinicId: user.clinicId, userId: user.id, userName: user.name, userRole: "DOCTOR", sessionId,
    action: "auth.mobile.login", module: "autenticacao", entity: "User", entityId: user.id,
    request: { ipAddress: ip, userAgent: request.headers.get("user-agent"), endpoint: "/api/doctor/v1/auth/login", httpMethod: "POST" },
  });
  return privateMobileJson({ token, tokenType: "Bearer", expiresIn: DOCTOR_MOBILE_TOKEN_SECONDS });
}
