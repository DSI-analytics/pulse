import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { getDoctorMobilePatients } from "@/server/doctor-mobile-clinical";

export async function GET(request: Request) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  return privateMobileJson(await getDoctorMobilePatients(context, new URL(request.url)));
}
