import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export interface PatientPortalContext {
  accessId: string;
  patientId: string;
  clinicId: string;
}

export async function authenticatePatientRequest(request: Request): Promise<PatientPortalContext | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token || token.length < 24) return null;

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const access = await prisma.patientPortalAccess.findUnique({
    where: { tokenHash },
    select: { id: true, patientId: true, clinicId: true, isActive: true, expiresAt: true, lastUsedAt: true },
  });
  if (!access?.isActive || (access.expiresAt && access.expiresAt <= new Date())) return null;

  if (!access.lastUsedAt || Date.now() - access.lastUsedAt.getTime() > 5 * 60_000) {
    await prisma.patientPortalAccess.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } });
  }
  return { accessId: access.id, patientId: access.patientId, clinicId: access.clinicId };
}

export function patientUnauthorized() {
  return Response.json({ error: "Acesso do paciente inválido ou expirado." }, {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}
