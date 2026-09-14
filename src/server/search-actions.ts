"use server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { patientSearchWhere } from "@/server/patient-search";
import { getTranslator } from "@/i18n/server";

export interface SearchHit {
  /** Tipo do resultado; o rótulo traduz-se com `nav.search.types.<type>`. */
  type: "patient" | "doctor" | "supplier" | "plan";
  label: string;
  sub: string;
  href: string;
}

export async function globalSearch(query: string): Promise<SearchHit[]> {
  const user = await requireUser();
  const q = query.trim();
  if (q.length < 2) return [];
  const like = { contains: q, mode: "insensitive" as const };

  const [patients, doctors, suppliers, plans, t] = await Promise.all([
    prisma.patient.findMany({
      where: patientSearchWhere(user.clinicId, q),
      take: 5,
      select: { id: true, name: true, code: true, phone: true },
    }),
    prisma.doctor.findMany({
      where: { clinicId: user.clinicId, name: like },
      take: 4,
      select: { id: true, name: true, specialty: { select: { name: true } } },
    }),
    prisma.supplier.findMany({
      where: { clinicId: user.clinicId, name: like },
      take: 3,
      select: { id: true, name: true, category: true },
    }),
    prisma.healthPlan.findMany({
      where: { clinicId: user.clinicId, name: like },
      take: 3,
      select: { id: true, name: true, insuranceCompany: { select: { name: true } } },
    }),
    getTranslator(),
  ]);

  return [
    ...patients.map((p): SearchHit => ({
      type: "patient",
      label: p.name,
      sub: `${p.code}${p.phone ? " · " + p.phone : ""}`,
      href: `/pacientes/${p.id}`,
    })),
    ...doctors.map((d): SearchHit => ({
      type: "doctor",
      label: d.name,
      sub: d.specialty.name,
      href: `/medicos/${d.id}`,
    })),
    ...suppliers.map((s): SearchHit => ({
      type: "supplier",
      label: s.name,
      sub: s.category ?? t("nav.search.types.supplier"),
      href: `/fornecedores`,
    })),
    ...plans.map((p): SearchHit => ({
      type: "plan",
      label: p.name,
      sub: p.insuranceCompany.name,
      href: `/planos`,
    })),
  ];
}
