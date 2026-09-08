import { authenticatePatientRequest, patientUnauthorized } from "@/lib/patient-portal-auth";
import { createPatientAppointment } from "@/server/patient-portal";

export async function POST(request: Request) {
  const patient = await authenticatePatientRequest(request);
  if (!patient) return patientUnauthorized();
  const result = await createPatientAppointment(patient, await request.json().catch(() => null));
  return Response.json(result, {
    status: "error" in result ? 400 : 201,
    headers: { "Cache-Control": "no-store" },
  });
}
