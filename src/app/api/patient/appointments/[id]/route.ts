import { authenticatePatientRequest, patientUnauthorized } from "@/lib/patient-portal-auth";
import { cancelPatientAppointment } from "@/server/patient-portal";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const patient = await authenticatePatientRequest(request);
  if (!patient) return patientUnauthorized();
  const body = await request.json().catch(() => null) as { action?: string } | null;
  if (body?.action !== "cancel") return Response.json({ error: "Operação inválida." }, { status: 400 });
  const result = await cancelPatientAppointment(patient, (await params).id);
  return Response.json(result, {
    status: "error" in result ? 400 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
