import type { NextRequest } from "next/server";
import { handleRead, handleWrite } from "@/lib/fhir/handlers";
import { errors } from "@/lib/fhir/outcome";

/**
 * `/fhir/{resourceType}/{id}` — leitura (GET) e actualização (PUT).
 *
 * PATCH e DELETE não são suportados nesta versão: a actualização parcial exige
 * um contrato de merge que ainda não está definido, e a eliminação de dados
 * clínicos é deliberadamente feita por mudança de estado (§36).
 */

export async function GET(request: NextRequest, ctx: { params: Promise<{ resourceType: string; id: string }> }) {
  const { resourceType, id } = await ctx.params;
  return handleRead(request, resourceType, id);
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ resourceType: string; id: string }> }) {
  const { resourceType, id } = await ctx.params;
  return handleWrite(request, resourceType, id, "PUT");
}

export async function PATCH() {
  return errors.notSupported("PATCH não é suportado nesta versão. Use PUT com o recurso completo.");
}

export async function DELETE() {
  return errors.notSupported(
    "A eliminação de dados clínicos não é exposta pela API. Use a actualização de estado (ex.: clinicalStatus) para inactivar um recurso.",
  );
}
