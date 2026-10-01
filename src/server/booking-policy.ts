import "server-only";

import { DEFAULT_MIN_BOOKING_LEAD_MINUTES } from "@/lib/domain/booking-policy";
import { prisma } from "@/lib/prisma";

export async function getMinimumBookingLeadMinutes(clinicId: string): Promise<number> {
  const settings = await prisma.clinicSettings.findUnique({
    where: { clinicId },
    select: { minBookingLeadMinutes: true },
  });
  return settings?.minBookingLeadMinutes ?? DEFAULT_MIN_BOOKING_LEAD_MINUTES;
}
