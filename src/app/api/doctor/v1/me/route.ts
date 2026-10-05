import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { getDoctorMobileProfile } from "@/server/doctor-mobile";

export async function GET(request: Request) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const doctor = await getDoctorMobileProfile(context);
  if (!doctor) return doctorMobileUnauthorized();
  return privateMobileJson({ doctor });
}
