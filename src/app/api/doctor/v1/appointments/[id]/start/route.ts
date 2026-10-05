import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { startDoctorMobileAppointment } from "@/server/doctor-mobile";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const { id } = await params;
  const result = await startDoctorMobileAppointment(context, id);
  return privateMobileJson(result, { status: "error" in result ? 409 : 200 });
}
