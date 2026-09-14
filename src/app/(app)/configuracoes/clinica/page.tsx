import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SUPPORTED_TIMEZONES } from "@/lib/format";
import { SettingsHeader } from "@/components/settings/settings-header";
import { ClinicProfileForm } from "@/components/settings/clinic-profile-form";
import { BranchManager } from "@/components/settings/branch-manager";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("settings.sections.clinic.title") };
}

export default async function ClinicaPage() {
  const user = await requirePermission("settings.manage");

  const [clinic, branches] = await Promise.all([
    prisma.clinic.findUniqueOrThrow({
      where: { id: user.clinicId },
      select: { name: true, nuit: true, phone: true, email: true, address: true, city: true, country: true, timezone: true },
    }),
    prisma.branch.findMany({
      where: { clinicId: user.clinicId },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
      select: {
        id: true, name: true, address: true, phone: true, isMain: true,
        _count: { select: { doctors: true, appointments: true } },
      },
    }),
  ]);

  const timezones = Array.from(new Set<string>([...SUPPORTED_TIMEZONES, clinic.timezone]));

  return (
    <>
      <SettingsHeader section="clinic" />
      <ClinicProfileForm clinic={clinic} timezones={timezones} />
      <BranchManager
        branches={branches.map(({ _count, ...branch }) => ({
          ...branch,
          doctors: _count.doctors,
          appointments: _count.appointments,
        }))}
      />
    </>
  );
}
