import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { dischargeDoctorMobileAdmission } from "@/server/doctor-mobile-clinical";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const { id } = await params;
  const result = await dischargeDoctorMobileAdmission(context, id, await request.json().catch(() => null));
  return privateMobileJson(result, { status: "error" in result ? 409 : 200 });
}
