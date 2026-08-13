"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { clinicId: user.clinicId, isRead: false },
    data: { isRead: true },
  });
  revalidatePath("/");
}
