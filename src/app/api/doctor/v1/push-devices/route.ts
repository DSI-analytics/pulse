import { z } from "zod";
import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { deactivateDoctorPushDevice, registerDoctorPushDevice } from "@/server/doctor-push-notifications";

const schema = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(["android", "ios"]),
});

export async function POST(request: Request) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateMobileJson({ error: "Dispositivo inválido." }, { status: 400 });
  return privateMobileJson(await registerDoctorPushDevice(context, parsed.data.token, parsed.data.platform));
}

export async function DELETE(request: Request) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const parsed = schema.pick({ token: true }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateMobileJson({ error: "Dispositivo inválido." }, { status: 400 });
  return privateMobileJson(await deactivateDoctorPushDevice(context, parsed.data.token));
}
