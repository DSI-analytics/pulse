import { authenticatePublicBooking } from "@/lib/public-booking-auth";
import { getPublicDoctorAvailability } from "@/server/public-booking";

export async function GET(request: Request) {
  const auth = await authenticatePublicBooking(request, "read");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const result = await getPublicDoctorAvailability(
    auth.principal,
    url.searchParams.get("doctorId") ?? "",
    url.searchParams.get("date") ?? "",
  );
  return Response.json(result, {
    status: "error" in result ? 400 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
