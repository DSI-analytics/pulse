import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { getDoctorMobileAppointments } from "@/server/doctor-mobile";

export async function GET(request: Request) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const result = await getDoctorMobileAppointments(context, new URL(request.url));
  return privateMobileJson(result, { status: "error" in result ? 400 : 200 });
}
