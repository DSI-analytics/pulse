import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { getDoctorMobileAppointment } from "@/server/doctor-mobile";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const { id } = await params;
  const appointment = await getDoctorMobileAppointment(context, id);
  return appointment
    ? privateMobileJson({ appointment })
    : privateMobileJson({ error: "Marcação não encontrada." }, { status: 404 });
}
