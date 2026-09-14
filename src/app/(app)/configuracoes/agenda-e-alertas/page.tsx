import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsHeader } from "@/components/settings/settings-header";
import { ScheduleForm } from "@/components/settings/schedule-form";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("settings.sections.schedule.title") };
}

export default async function AgendaAlertasPage() {
  const user = await requirePermission("settings.manage");
  const settings = await prisma.clinicSettings.findUnique({
    where: { clinicId: user.clinicId },
    select: {
      defaultSlotMinutes: true,
      defaultConsultationFee: true,
      lowStockLeadDays: true,
      expiryWarningDays: true,
      receivableOverdueDays: true,
    },
  });

  return (
    <>
      <SettingsHeader section="schedule" />
      {/* Sem registo ainda: valores predefinidos do schema. */}
      <ScheduleForm
        values={
          settings ?? {
            defaultSlotMinutes: 30,
            defaultConsultationFee: 150_000,
            lowStockLeadDays: 10,
            expiryWarningDays: 30,
            receivableOverdueDays: 30,
          }
        }
      />
    </>
  );
}
