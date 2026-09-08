import { authenticatePatientRequest, patientUnauthorized } from "@/lib/patient-portal-auth";
import { getPatientDoctorAvailability } from "@/server/patient-portal";

export async function GET(request: Request) {
  const patient = await authenticatePatientRequest(request);
  if (!patient) return patientUnauthorized();
  const url = new URL(request.url);
  const result = await getPatientDoctorAvailability(patient, url.searchParams.get("doctorId") ?? "", url.searchParams.get("date") ?? "");
  return Response.json(result, {
    status: "error" in result ? 400 : 200,
    headers: { "Cache-Control": "no-store, private" },
  });
}
