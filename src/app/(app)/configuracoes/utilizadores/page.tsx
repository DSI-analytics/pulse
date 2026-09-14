import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsHeader } from "@/components/settings/settings-header";
import { UserManagement } from "@/components/user-management";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("settings.sections.users.title") };
}

export default async function UtilizadoresPage() {
  const user = await requirePermission("user.manage");

  const [users, doctors] = await Promise.all([
    prisma.user.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, doctor: { select: { id: true, name: true } } },
    }),
    prisma.doctor.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true, userId: true } }),
  ]);

  return (
    <>
      <SettingsHeader section="users" />
      <Card>
        <CardContent className="p-5">
          <UserManagement
            users={users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
            doctors={doctors}
            currentUserId={user.userId}
            currentRole={user.role}
          />
        </CardContent>
      </Card>
    </>
  );
}
