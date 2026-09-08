import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { can, type Permission } from "./rbac";
import { prisma } from "./prisma";

const COOKIE = "pulso_session";
const MAX_AGE = 60 * 60 * 8; // 8h

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET em falta ou demasiado curto (min. 32 caracteres).");
  }
  return new TextEncoder().encode(s);
}

export interface SessionUser {
  userId: string;
  clinicId: string;
  role: UserRole;
  name: string;
  email: string;
  doctorId?: string | null;
  sessionVersion: number;
  /** Opaque per-login identifier, recorded on every audit entry. */
  sessionId?: string;
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user, sessionId: user.sessionId ?? randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Returns the session user or null. Never throws. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

/** Require an authenticated user or redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");

  // The database is the source of truth for access. This makes deactivation,
  // role changes and doctor associations effective for already-open sessions.
  const current = await prisma.user.findFirst({
    where: { id: session.userId, clinicId: session.clinicId, isActive: true },
    select: {
      id: true,
      clinicId: true,
      role: true,
      name: true,
      email: true,
      sessionVersion: true,
      doctor: { select: { id: true } },
    },
  });
  if (!current) redirect("/login?motivo=conta-inativa");
  if ((session.sessionVersion ?? 0) !== current.sessionVersion) redirect("/login?motivo=sessao-expirada");

  return {
    userId: current.id,
    clinicId: current.clinicId,
    role: current.role,
    name: current.name,
    email: current.email,
    doctorId: current.doctor?.id ?? null,
    sessionVersion: current.sessionVersion,
    sessionId: session.sessionId,
  };
}

/** Require a specific permission or redirect (to dashboard if logged in, else login). */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/sem-acesso");
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// Institution (tenant) scope
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Institutions this user may read data from: always their home clinic, plus any
 * explicitly granted through `UserClinicAccess`. SUPER_ADMIN is *not* granted
 * every clinic implicitly — access must still be explicit, so cross-tenant
 * reads are always auditable.
 */
export async function authorizedClinicIds(user: SessionUser): Promise<string[]> {
  const extra = await prisma.userClinicAccess.findMany({
    where: { userId: user.userId },
    select: { clinicId: true },
  });
  return Array.from(new Set([user.clinicId, ...extra.map((a) => a.clinicId)]));
}

/**
 * Resolve the clinic a request should operate on. A client-supplied clinicId is
 * only honoured when it is in the user's authorised set — never trusted as-is.
 * Returns the home clinic when nothing valid was requested.
 */
export async function resolveClinicScope(
  user: SessionUser,
  requestedClinicId?: string | null,
): Promise<{ clinicId: string; authorized: string[] }> {
  const authorized = await authorizedClinicIds(user);
  const requested = (requestedClinicId ?? "").trim();
  const clinicId = requested && authorized.includes(requested) ? requested : user.clinicId;
  return { clinicId, authorized };
}

/** Non-redirecting variant for API routes (returns null instead of redirecting). */
export async function getAuthorizedUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  const current = await prisma.user.findFirst({
    where: { id: session.userId, clinicId: session.clinicId, isActive: true },
    select: {
      id: true,
      clinicId: true,
      role: true,
      name: true,
      email: true,
      sessionVersion: true,
      doctor: { select: { id: true } },
    },
  });
  if (!current) return null;
  if ((session.sessionVersion ?? 0) !== current.sessionVersion) return null;
  return {
    userId: current.id,
    clinicId: current.clinicId,
    role: current.role,
    name: current.name,
    email: current.email,
    doctorId: current.doctor?.id ?? null,
    sessionVersion: current.sessionVersion,
    sessionId: session.sessionId,
  };
}
