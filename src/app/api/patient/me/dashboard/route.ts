import { authenticatePatientRequest, patientUnauthorized } from "@/lib/patient-portal-auth";
import { getPatientDashboard } from "@/server/patient-portal";

export async function GET(request: Request) {
  const patient = await authenticatePatientRequest(request);
  if (!patient) return patientUnauthorized();
  const data = await getPatientDashboard(patient);
  return Response.json(data, { headers: { "Cache-Control": "no-store, private" } });
}
