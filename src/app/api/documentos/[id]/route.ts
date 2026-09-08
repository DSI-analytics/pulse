import type { NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { getAuthorizedUser } from "@/lib/auth";
import { readStoredFile } from "@/lib/documents";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

/**
 * Entrega controlada de documentos clínicos.
 *
 * Nenhum documento é acessível por URL pública: cada pedido revalida a sessão,
 * a permissão `document.view` e a clínica do registo, e fica auditado. O
 * conteúdo é servido com `Content-Disposition: attachment` e `nosniff` para
 * impedir que um ficheiro carregado seja interpretado como página no browser.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAuthorizedUser();
  if (!user) {
    return Response.json({ error: "Sessão inválida." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!can(user.role, "document.view")) {
    await audit({
      clinicId: user.clinicId,
      userId: user.userId,
      userName: user.name,
      userRole: user.role,
      sessionId: user.sessionId ?? null,
      action: "attachment.download",
      entity: "ClinicalAttachment",
      entityId: id,
      result: "NEGADO",
    });
    return Response.json({ error: "Sem permissão." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const attachment = await prisma.clinicalAttachment.findFirst({
    where: { id, clinicId: user.clinicId, deletedAt: null },
    select: { id: true, name: true, mimeType: true, storageKey: true, patientId: true },
  });
  if (!attachment) {
    return Response.json({ error: "Documento não encontrado." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  let body: Buffer;
  try {
    body = await readStoredFile(attachment.storageKey);
  } catch {
    return Response.json({ error: "Ficheiro indisponível." }, { status: 410, headers: { "Cache-Control": "no-store" } });
  }

  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    sessionId: user.sessionId ?? null,
    action: "attachment.download",
    entity: "ClinicalAttachment",
    entityId: attachment.id,
    metadata: { patientId: attachment.patientId },
  });

  const filename = attachment.name.replace(/"/g, "");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
