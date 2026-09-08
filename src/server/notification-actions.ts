"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { visibleNotificationsWhere } from "@/server/notifications";

export async function markAllNotificationsRead() {
  const user = await requireUser();
  // Só marca como lidas as notificações que este utilizador pode efectivamente
  // ver — nunca as de outros destinatários ou fora das suas permissões.
  await prisma.notification.updateMany({
    where: { ...visibleNotificationsWhere(user), isRead: false },
    data: { isRead: true },
  });
  revalidatePath("/");
}
