import { authenticatePublicBooking } from "@/lib/public-booking-auth";
import { createPublicBookingRequest } from "@/server/public-booking";

export async function POST(request: Request) {
  const auth = await authenticatePublicBooking(request, "write");
  if (!auth.ok) return auth.response;

  const result = await createPublicBookingRequest(auth.principal, await request.json().catch(() => null));
  return Response.json(result, {
    status: "error" in result ? 400 : 201,
    headers: { "Cache-Control": "no-store" },
  });
}
