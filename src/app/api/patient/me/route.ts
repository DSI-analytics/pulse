import { authenticatePatientRequest, patientUnauthorized } from "@/lib/patient-portal-auth";
import { updatePatientPortalProfile } from "@/server/patient-portal";

export async function PATCH(request: Request) {
  const patient = await authenticatePatientRequest(request);
  if (!patient) return patientUnauthorized();
  const result = await updatePatientPortalProfile(patient, await request.json().catch(() => null));
  return Response.json(result, {
    status: "error" in result ? 400 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
