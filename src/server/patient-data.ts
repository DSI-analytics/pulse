export type PatientFormValues = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  gender?: string | null;
  birthDate?: string | null;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
};

const nonEmpty = (v?: string | null) => (v ?? "").trim();

const GENDER_VALUES = new Set(["MASCULINO", "FEMININO", "OUTRO"]);

export function normalizePatientData(values: PatientFormValues) {
  const sanitized = {
    name: nonEmpty(values.name),
    phone: nonEmpty(values.phone) || null,
    email: nonEmpty(values.email) || null,
    address: nonEmpty(values.address) || null,
    gender: GENDER_VALUES.has(nonEmpty(values.gender)) ? (nonEmpty(values.gender) as "MASCULINO" | "FEMININO" | "OUTRO") : null,
    birthDate: values.birthDate && nonEmpty(values.birthDate) ? new Date(values.birthDate) : null,
    emergencyContactName: nonEmpty(values.emergencyContactName) || null,
    emergencyContactPhone: nonEmpty(values.emergencyContactPhone) || null,
  };

  if (!sanitized.name) {
    throw new Error("Nome demasiado curto.");
  }

  return sanitized;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cadastro alargado (prontuário clínico electrónico)
// ─────────────────────────────────────────────────────────────────────────────

export type PatientProfileValues = PatientFormValues & {
  genderIdentity?: string;
  maritalStatus?: string | null;
  nationality?: string;
  occupation?: string;
  preferredLanguage?: string;
  photoUrl?: string;
  phoneAlt?: string;
  country?: string;
  province?: string;
  district?: string;
  city?: string;
  neighbourhood?: string;
  street?: string;
  streetNumber?: string;
  addressReference?: string;
  emergencyContactRelation?: string;
  emergencyContactPhoneAlt?: string;
  bloodType?: string | null;
  chronicConditions?: string;
  personalHistory?: string;
  surgicalHistory?: string;
  familyHistory?: string;
  habits?: string;
  clinicalSummary?: string;
  notes?: string;
};

const MARITAL_STATUS = new Set(["SOLTEIRO", "CASADO", "UNIAO_DE_FACTO", "DIVORCIADO", "VIUVO", "OUTRO"]);
const BLOOD_TYPES = new Set(["A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG", "DESCONHECIDO"]);

type MaritalStatusValue = "SOLTEIRO" | "CASADO" | "UNIAO_DE_FACTO" | "DIVORCIADO" | "VIUVO" | "OUTRO";
type BloodTypeValue = "A_POS" | "A_NEG" | "B_POS" | "B_NEG" | "AB_POS" | "AB_NEG" | "O_POS" | "O_NEG" | "DESCONHECIDO";

const capped = (v: string | null | undefined, max: number) => {
  const text = nonEmpty(v).slice(0, max);
  return text.length ? text : null;
};

/**
 * Cadastro completo do paciente. Compõe `normalizePatientData` (compatibilidade
 * com os formulários existentes) e acrescenta os campos do prontuário.
 */
export function normalizePatientProfile(values: PatientProfileValues) {
  const base = normalizePatientData(values);
  return {
    ...base,
    genderIdentity: capped(values.genderIdentity, 60),
    maritalStatus: MARITAL_STATUS.has(nonEmpty(values.maritalStatus))
      ? (nonEmpty(values.maritalStatus) as MaritalStatusValue)
      : null,
    nationality: capped(values.nationality, 80),
    occupation: capped(values.occupation, 120),
    preferredLanguage: capped(values.preferredLanguage, 40),
    photoUrl: capped(values.photoUrl, 500),
    phoneAlt: capped(values.phoneAlt, 40),
    country: capped(values.country, 80),
    province: capped(values.province, 80),
    district: capped(values.district, 80),
    city: capped(values.city, 80),
    neighbourhood: capped(values.neighbourhood, 120),
    street: capped(values.street, 160),
    streetNumber: capped(values.streetNumber, 20),
    addressReference: capped(values.addressReference, 300),
    emergencyContactRelation: capped(values.emergencyContactRelation, 80),
    emergencyContactPhoneAlt: capped(values.emergencyContactPhoneAlt, 40),
    bloodType: BLOOD_TYPES.has(nonEmpty(values.bloodType)) ? (nonEmpty(values.bloodType) as BloodTypeValue) : null,
    chronicConditions: capped(values.chronicConditions, 4000),
    personalHistory: capped(values.personalHistory, 8000),
    surgicalHistory: capped(values.surgicalHistory, 8000),
    familyHistory: capped(values.familyHistory, 8000),
    habits: capped(values.habits, 4000),
    clinicalSummary: capped(values.clinicalSummary, 8000),
    notes: capped(values.notes, 4000),
  };
}

/** Idade em anos completos, calculada na data indicada (ou hoje). */
export function ageInYears(birthDate: Date | null | undefined, at: Date = new Date()): number | null {
  if (!birthDate) return null;
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = at.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && at.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}
