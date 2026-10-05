import { z } from "zod";
import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { getDoctorNotificationSettings, updateDoctorNotificationSettings } from "@/server/doctor-push-notifications";

const schema = z.object({
  appointments: z.boolean(),
  checkIns: z.boolean(),
  cancellations: z.boolean(),
  clinicalAlerts: z.boolean(),
  examResults: z.boolean(),
  reminders: z.boolean(),
  pushEnabled: z.boolean(),
});

export async function GET(request: Request) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  return privateMobileJson({ settings: await getDoctorNotificationSettings(context) });
}

export async function PUT(request: Request) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateMobileJson({ error: "Preferências inválidas." }, { status: 400 });
  return privateMobileJson({ settings: await updateDoctorNotificationSettings(context, parsed.data) });
}
