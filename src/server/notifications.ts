import "server-only";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { permissionsOf } from "@/lib/rbac";

/**
 * Notificações visíveis para um utilizador (§12).
 *
 * Uma notificação chega a quem lhe é dirigida (`userId`) ou a toda a clínica
 * quando não exige permissão. Se exigir (por exemplo `laboratory.view` num
 * resultado de exame), só é entregue a quem tem essa permissão — a filtragem é
 * feita na consulta, não na interface.
 */
export function visibleNotificationsWhere(user: SessionUser): Prisma.NotificationWhereInput {
  const permissions = permissionsOf(user.role) as string[];
  return {
    clinicId: user.clinicId,
    OR: [
      { userId: user.userId },
      { userId: null, requiredPermission: null },
      { userId: null, requiredPermission: { in: permissions } },
    ],
  };
}

export async function getVisibleNotifications(user: SessionUser, take = 12) {
  const where = visibleNotificationsWhere(user);
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, title: true, body: true, severity: true, createdAt: true },
    }),
    prisma.notification.count({ where: { ...where, isRead: false } }),
  ]);
  return { notifications, unread };
}
