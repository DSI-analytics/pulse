import type { NextRequest } from "next/server";
import { handleSearch, handleWrite } from "@/lib/fhir/handlers";
import { errors } from "@/lib/fhir/outcome";

/**
 * `/fhir/{resourceType}` — pesquisa (GET) e criação (POST).
 *
 * Ex.: GET /fhir/Patient?name=Ana&_count=20
 *      POST /fhir/Observation  (application/fhir+json)
 */

export async function GET(request: NextRequest, ctx: { params: Promise<{ resourceType: string }> }) {
  const { resourceType } = await ctx.params;
  return handleSearch(request, resourceType);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ resourceType: string }> }) {
  const { resourceType } = await ctx.params;
  return handleWrite(request, resourceType, null, "POST");
}

export async function PUT() {
  return errors.notSupported("PUT requer o id do recurso: /fhir/{resourceType}/{id}.");
}

export async function DELETE() {
  return errors.notSupported(
    "A eliminação de dados clínicos não é exposta pela API. Use a actualização de estado (ex.: clinicalStatus) para inactivar um recurso.",
  );
}
