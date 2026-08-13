"use server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export interface SearchHit {
  type: "Paciente" | "Médico" | "Fornecedor" | "Plano";
  label: string;
  sub: string;
  href: string;
}

export async function globalSearch(query: string): Promise<SearchHit[]> {
  const user = await requireUser();
  const q = query.trim();
  if (q.length < 2) return [];
  const like = { contains: q, mode: "insensitive" as const };

  const [patients, doctors, suppliers, plans] = await Promise.all([
    prisma.patient.findMany({
      where: { clinicId: user.clinicId, OR: [{ name: like }, { phone: { contains: q } }, { code: like }] },
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
  ]);

  return [
    ...patients.map((p): SearchHit => ({
      type: "Paciente",
      label: p.name,
      sub: `${p.code}${p.phone ? " · " + p.phone : ""}`,
      href: `/pacientes/${p.id}`,
    })),
    ...doctors.map((d): SearchHit => ({
      type: "Médico",
      label: d.name,
      sub: d.specialty.name,
      href: `/medicos/${d.id}`,
    })),
    ...suppliers.map((s): SearchHit => ({
      type: "Fornecedor",
      label: s.name,
      sub: s.category ?? "Fornecedor",
      href: `/fornecedores`,
    })),
    ...plans.map((p): SearchHit => ({
      type: "Plano",
      label: p.name,
      sub: p.insuranceCompany.name,
      href: `/planos`,
    })),
  ];
}
