import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const ISSUER = "pulso-api";
const AUDIENCE = "pulso-medico";
export const DOCTOR_MOBILE_TOKEN_SECONDS = 12 * 60 * 60;

export interface DoctorMobileContext {
  userId: string;
  clinicId: string;
  doctorId: string;
  role: "DOCTOR";
  name: string;
  email: string;
  sessionVersion: number;
  sessionId: string;
}

function signingKey(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET em falta ou demasiado curto.");
  return new TextEncoder().encode(value);
}

export async function createDoctorMobileToken(context: DoctorMobileContext): Promise<string> {
  return new SignJWT({
    clinicId: context.clinicId,
    doctorId: context.doctorId,
    role: context.role,
    name: context.name,
    email: context.email,
    sessionVersion: context.sessionVersion,
    sessionId: context.sessionId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(context.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${DOCTOR_MOBILE_TOKEN_SECONDS}s`)
    .sign(signingKey());
}

export async function authenticateDoctorMobileRequest(request: Request): Promise<DoctorMobileContext | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  try {
    const { payload } = await jwtVerify(token, signingKey(), { issuer: ISSUER, audience: AUDIENCE });
    if (!payload.sub || payload.role !== "DOCTOR" || typeof payload.doctorId !== "string") return null;
    const user = await prisma.user.findFirst({
      where: {
        id: payload.sub,
        clinicId: String(payload.clinicId ?? ""),
        role: "DOCTOR",
        isActive: true,
        sessionVersion: Number(payload.sessionVersion ?? -1),
        doctor: { id: payload.doctorId },
      },
      select: { id: true, clinicId: true, name: true, email: true, role: true, sessionVersion: true, doctor: { select: { id: true } } },
    });
    if (!user?.doctor) return null;
    return {
      userId: user.id,
      clinicId: user.clinicId,
      doctorId: user.doctor.id,
      role: "DOCTOR",
      name: user.name,
      email: user.email,
      sessionVersion: user.sessionVersion,
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : "mobile",
    };
  } catch {
    return null;
  }
}

export function doctorMobileUnauthorized(message = "Sessão inválida ou expirada.") {
  return Response.json({ error: message }, {
    status: 401,
    headers: { "Cache-Control": "no-store", "WWW-Authenticate": "Bearer" },
  });
}

export function privateMobileJson(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, private");
  return Response.json(data, { ...init, headers });
}
