import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { getDoctorMobileDashboard } from "@/server/doctor-mobile";

export async function GET(request: Request) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  return privateMobileJson(await getDoctorMobileDashboard(context));
}
