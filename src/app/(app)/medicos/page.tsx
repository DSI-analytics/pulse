import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getDoctorCards } from "@/server/doctor-analytics";
import { createDoctorRecord, createSpecialtyRecord } from "@/server/crud-actions";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { ListFilters } from "@/components/list-filters";
import { getFormatters, getTranslator } from "@/i18n/server";

/** Mesma paleta OKLCH de src/components/settings/specialty-manager.tsx. */
const SPECIALTY_PALETTE = [
  { key: "teal", value: "oklch(55% 0.11 182)" },
  { key: "blue", value: "oklch(54% 0.15 250)" },
  { key: "indigo", value: "oklch(50% 0.16 275)" },
  { key: "violet", value: "oklch(54% 0.18 305)" },
  { key: "pink", value: "oklch(58% 0.2 350)" },
  { key: "red", value: "oklch(56% 0.2 28)" },
  { key: "amber", value: "oklch(68% 0.16 65)" },
  { key: "green", value: "oklch(56% 0.14 150)" },
] as const;

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("doctors.title") };
}

export default async function MedicosPage({ searchParams }: { searchParams: Promise<{ q?: string; especialidade?: string }> }) {
  const user = await requirePermission("doctor.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const canViewFinancials = can(user.role, "finance.view");
  const sp = await searchParams;
  const query = (sp.q ?? "").trim().toLocaleLowerCase("pt");
  const allDoctors = await getDoctorCards(user.clinicId, canViewFinancials);
  const specialties = await prisma.specialty.findMany({
    where: { clinicId: user.clinicId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const selectedSpecialty = specialties.find((specialty) => specialty.id === sp.especialidade)?.name;
  const doctors = allDoctors.filter((doctor) =>
    (!query || doctor.name.toLocaleLowerCase("pt").includes(query))
    && (!selectedSpecialty || doctor.specialty === selectedSpecialty),
  );
  const canManage = can(user.role, "doctor.manage");

  return (
    <>
      <PageHeader
        eyebrow={t("catalog.eyebrow")}
        title={t("doctors.title")}
        description={t("doctors.description")}
        actions={
          canManage ? (
            <>
              <CadastroButton
                variant="secondary"
                label={t("doctors.newSpecialty")}
                title={t("doctors.newSpecialty")}
                action={createSpecialtyRecord}
                fields={[
                  { name: "name", label: t("settings.specialties.name"), required: true, full: true, placeholder: t("doctors.specialtyPlaceholder") },
                  { name: "color", label: t("settings.specialties.color"), type: "select", full: true, defaultValue: SPECIALTY_PALETTE[0].value, options: SPECIALTY_PALETTE.map((option) => ({
                    value: option.value, label: t(`settings.specialties.colors.${option.key}`),
                  })) },
                ]}
              />
              <CadastroButton
                label={t("doctors.newDoctor")}
                title={t("doctors.newDoctor")}
                description={t("doctors.newDoctorDescription")}
                action={createDoctorRecord}
                fields={[
                  { name: "name", label: t("doctors.fields.name"), required: true, full: true, placeholder: t("doctors.fields.namePlaceholder") },
                  { name: "specialtyId", label: t("doctors.fields.specialty"), type: "select", required: true, full: true, options: specialties.map((s) => ({ value: s.id, label: s.name })) },
                  { name: "consultationPrice", label: t("doctors.fields.consultationPrice"), type: "money", required: true, suffix: f.currency, placeholder: "1500" },
                  { name: "consultationDuration", label: t("doctors.fields.duration"), type: "number", suffix: t("doctors.minutesUnit"), defaultValue: "30" },
                  { name: "phone", label: t("doctors.fields.phone"), type: "tel" },
                  { name: "email", label: t("doctors.fields.email"), type: "email" },
                  { name: "licenseNumber", label: t("doctors.fields.license"), full: true },
                ]}
              />
            </>
          ) : undefined
        }
      />

      <ListFilters action="/medicos" fields={[
        { name: "q", label: t("catalog.search"), value: sp.q?.trim(), type: "search", placeholder: t("doctors.searchPlaceholder") },
        { name: "especialidade", label: t("doctors.fields.specialty"), value: sp.especialidade, options: specialties.map((specialty) => ({ value: specialty.id, label: specialty.name })) },
      ]} />

      <div className="space-y-3">
        {doctors.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">{t("doctors.empty")}</Card>}
        {doctors.map((d) => (
          <Link
            key={d.id}
            href={`/medicos/${d.id}`}
            className="block transition-colors"
          >
            <Card className="p-4 hover:shadow-card-hover hover:[--card-border:var(--primary-edge)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar name={d.name} color={d.color} className="size-10 text-sm flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-sm">{d.name}</p>
                    <p className="text-[13px] text-muted-foreground">{d.specialty}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular">{d.occupancy}%</p>
                    <p className="text-[11px] text-muted-foreground">{t("doctors.occupancy")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular">{d.consultas}</p>
                    <p className="text-[11px] text-muted-foreground">{t("doctors.consultations")}</p>
                  </div>
                  {canViewFinancials && <div className="text-right">
                    <p className="text-sm font-semibold tabular">{f.money(d.receita)}</p>
                    <p className="text-[11px] text-muted-foreground">{t("doctors.revenue")}</p>
                  </div>}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
