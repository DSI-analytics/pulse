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
    birthDate: nonEmpty(values.birthDate) ? new Date(values.birthDate) : null,
    emergencyContactName: nonEmpty(values.emergencyContactName) || null,
    emergencyContactPhone: nonEmpty(values.emergencyContactPhone) || null,
  };

  if (!sanitized.name) {
    throw new Error("Nome demasiado curto.");
  }

  return sanitized;
}
