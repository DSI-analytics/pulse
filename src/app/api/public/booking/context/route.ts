import { authenticatePublicBooking } from "@/lib/public-booking-auth";
import { getPublicBookingContext } from "@/server/public-booking";

export async function GET(request: Request) {
  const auth = await authenticatePublicBooking(request, "read");
  if (!auth.ok) return auth.response;
  return Response.json(await getPublicBookingContext(auth.principal), {
    headers: { "Cache-Control": "no-store" },
  });
}
