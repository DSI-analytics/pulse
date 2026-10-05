import { z } from "zod";
import { authenticateDoctorMobileRequest, doctorMobileUnauthorized, privateMobileJson } from "@/lib/doctor-mobile-auth";
import { getDoctorMobileNotifications, markDoctorMobileNotificationsRead } from "@/server/doctor-mobile";

const readSchema = z.object({ ids: z.array(z.string().min(1)).max(50).optional() });

export async function GET(request: Request) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const unreadOnly = new URL(request.url).searchParams.get("unread") === "true";
  return privateMobileJson(await getDoctorMobileNotifications(context, unreadOnly));
}

export async function PATCH(request: Request) {
  const context = await authenticateDoctorMobileRequest(request);
  if (!context) return doctorMobileUnauthorized();
  const parsed = readSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return privateMobileJson({ error: "Pedido inválido." }, { status: 400 });
  return privateMobileJson(await markDoctorMobileNotificationsRead(context, parsed.data.ids));
}
