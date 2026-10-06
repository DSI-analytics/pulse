import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { getDoctorMobilePatient } from "@/server/doctor-mobile-clinical";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const { id } = await params;
  const patient = await getDoctorMobilePatient(context, id);
  return patient
    ? privateMobileJson({ patient })
    : privateMobileJson({ error: "Paciente não encontrado." }, { status: 404 });
}
