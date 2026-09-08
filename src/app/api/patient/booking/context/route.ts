import { authenticatePatientRequest, patientUnauthorized } from "@/lib/patient-portal-auth";
import { getPatientBookingContext } from "@/server/patient-portal";

export async function GET(request: Request) {
  const patient = await authenticatePatientRequest(request);
  if (!patient) return patientUnauthorized();
  return Response.json(await getPatientBookingContext(patient), { headers: { "Cache-Control": "no-store, private" } });
}
