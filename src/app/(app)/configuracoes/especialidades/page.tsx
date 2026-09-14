import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SpecialtyManager } from "@/components/settings/specialty-manager";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("settings.sections.specialties.title") };
}

export default async function EspecialidadesPage() {
  // Mesma permissão que as acções de especialidades (crud-actions).
  const user = await requirePermission("doctor.manage");
  const specialties = await prisma.specialty.findMany({
    where: { clinicId: user.clinicId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true, _count: { select: { doctors: true } } },
  });

  return (
    <>
      <SettingsHeader section="specialties" />
      <SpecialtyManager
        specialties={specialties.map(({ _count, ...specialty }) => ({ ...specialty, doctors: _count.doctors }))}
      />
    </>
  );
}
