import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * Pesquisa de pacientes — critério partilhado pela lista, pela pesquisa global
 * e pelo cadastro.
 *
 * Cada ramo do `OR` assenta num índice: `Patient_name_trgm_idx`,
 * `Patient_phone_trgm_idx`, `Patient_email_trgm_idx`,
 * `PatientIdentityDocument_number_trgm_idx` (trigrama, para `contains`) e os
 * btree `(clinicId, code)` / `(clinicId, birthDate)`.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PT_DATE = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;

/** Aceita "1990-04-21" e "21/04/1990". */
export function parseSearchDate(value: string): Date | null {
  const raw = value.trim();
  if (ISO_DATE.test(raw)) {
    const date = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = PT_DATE.exec(raw);
  if (!match) return null;
  const date = new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface PatientSearchOptions {
  /** Inclui pacientes inactivos ou fundidos noutro registo. */
  includeInactive?: boolean;
}

export function patientSearchWhere(
  clinicId: string,
  query: string,
  options: PatientSearchOptions = {},
): Prisma.PatientWhereInput {
  const base: Prisma.PatientWhereInput = {
    clinicId,
    ...(options.includeInactive ? {} : { isActive: true, mergedIntoId: null }),
  };

  const term = query.trim();
  if (term.length < 2) return base;

  const like = { contains: term, mode: "insensitive" as const };
  const digits = term.replace(/\D/g, "");
  const birthDate = parseSearchDate(term);

  const or: Prisma.PatientWhereInput[] = [
    { name: like },
    { code: like },
    { email: like },
    { identityDocuments: { some: { number: { contains: term.replace(/[^a-zA-Z0-9]/g, ""), mode: "insensitive" } } } },
  ];
  if (digits.length >= 4) {
    or.push({ phone: { contains: digits } });
    or.push({ phoneAlt: { contains: digits } });
  }
  if (birthDate) or.push({ birthDate });

  return { ...base, OR: or };
}
