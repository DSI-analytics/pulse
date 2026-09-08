import type { UserRole } from "@prisma/client";

// Permission catalog. Built-in roles map to sets of these keys. The Role table
// in the schema lets tenants define custom roles over the same catalog later.
//
// Every key is enforced **server-side** (see `requirePermission` in lib/auth.ts
// and the `guard()` helpers in src/server/*). Frontend checks are cosmetic only.
export const PERMISSIONS = {
  "dashboard.view": "Ver painel executivo",
  "appointment.view": "Ver marcações",
  "appointment.manage": "Criar / remarcar / cancelar marcações",
  "appointment.checkin": "Check-in de pacientes",
  "patient.view": "Ver pacientes",
  "patient.manage": "Criar / editar pacientes",
  "consultation.conduct": "Iniciar e concluir consultas",
  "consultation.viewClinical": "Ver notas clínicas",
  // Prontuário clínico electrónico
  "encounter.view": "Ver episódios clínicos",
  "encounter.manage": "Criar / editar episódios clínicos",
  "vitals.record": "Registar sinais vitais",
  "allergy.manage": "Registar e actualizar alergias",
  "prescription.create": "Emitir prescrições",
  "laboratory.view": "Ver pedidos e resultados de exames",
  "laboratory.manage": "Gerir pedidos e lançar resultados",
  "admission.manage": "Gerir internamentos",
  "document.view": "Ver documentos clínicos",
  "document.manage": "Anexar e gerir documentos clínicos",
  // Catálogo e gestão
  "doctor.view": "Ver médicos e disponibilidade",
  "doctor.manage": "Gerir médicos e horários",
  "doctor.stats": "Ver estatísticas de médicos",
  "healthplan.view": "Ver planos de saúde",
  "healthplan.manage": "Gerir planos de saúde",
  "service.view": "Ver serviços e exames",
  "service.manage": "Gerir serviços, exames e preços",
  "finance.view": "Ver financeiro",
  "finance.manage": "Gerir receitas, despesas e recebimentos",
  "inventory.view": "Ver stock",
  "inventory.manage": "Gerir stock e movimentos",
  "supplier.view": "Ver fornecedores e compras",
  "supplier.manage": "Gerir fornecedores e compras",
  "report.view": "Ver relatórios",
  "insights.view": "Ver Insights e assistente de gestão",
  "settings.manage": "Gerir configurações da clínica",
  "user.manage": "Gerir utilizadores e permissões",
  "audit.view": "Consultar registos de auditoria",
  "fhir.access": "Aceder à API de interoperabilidade FHIR",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_CATEGORY: Record<Permission, string> = {
  "dashboard.view": "Geral",
  "insights.view": "Geral",
  "report.view": "Geral",
  "appointment.view": "Agenda",
  "appointment.manage": "Agenda",
  "appointment.checkin": "Agenda",
  "patient.view": "Prontuário",
  "patient.manage": "Prontuário",
  "consultation.conduct": "Prontuário",
  "consultation.viewClinical": "Prontuário",
  "encounter.view": "Prontuário",
  "encounter.manage": "Prontuário",
  "vitals.record": "Prontuário",
  "allergy.manage": "Prontuário",
  "prescription.create": "Prontuário",
  "laboratory.view": "Laboratório",
  "laboratory.manage": "Laboratório",
  "admission.manage": "Prontuário",
  "document.view": "Documentos",
  "document.manage": "Documentos",
  "doctor.view": "Gestão",
  "doctor.manage": "Gestão",
  "doctor.stats": "Gestão",
  "healthplan.view": "Gestão",
  "healthplan.manage": "Gestão",
  "service.view": "Gestão",
  "service.manage": "Gestão",
  "finance.view": "Financeiro",
  "finance.manage": "Financeiro",
  "inventory.view": "Stock",
  "inventory.manage": "Stock",
  "supplier.view": "Stock",
  "supplier.manage": "Stock",
  "settings.manage": "Sistema",
  "user.manage": "Sistema",
  "audit.view": "Sistema",
  "fhir.access": "Sistema",
};

const ALL = Object.keys(PERMISSIONS) as Permission[];

const CLINICAL_READ: Permission[] = [
  "patient.view",
  "consultation.viewClinical",
  "encounter.view",
  "laboratory.view",
  "document.view",
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ALL,
  CLINIC_ADMIN: ALL,
  // Gestão da instituição: indicadores e leitura operacional, SEM privilégios
  // administrativos (não gere utilizadores, configurações, nem dados clínicos).
  CLINIC_MANAGER: [
    "dashboard.view",
    "insights.view",
    "report.view",
    "appointment.view",
    "patient.view",
    "doctor.view",
    "doctor.stats",
    "healthplan.view",
    "service.view",
    "finance.view",
    "inventory.view",
    "supplier.view",
  ],
  RECEPTIONIST: [
    "dashboard.view",
    "appointment.view",
    "appointment.manage",
    "appointment.checkin",
    "patient.view",
    "patient.manage",
    "doctor.view",
    "healthplan.view",
    "service.view",
    "document.view",
  ],
  DOCTOR: [
    "dashboard.view",
    "appointment.view",
    "patient.view",
    "patient.manage",
    "consultation.conduct",
    "consultation.viewClinical",
    "encounter.view",
    "encounter.manage",
    "vitals.record",
    "allergy.manage",
    "prescription.create",
    "laboratory.view",
    "laboratory.manage",
    "admission.manage",
    "document.view",
    "document.manage",
    "doctor.view",
    "doctor.stats",
    "service.view",
  ],
  NURSE: [
    "dashboard.view",
    "appointment.view",
    "appointment.checkin",
    ...CLINICAL_READ,
    "encounter.manage",
    "vitals.record",
    "allergy.manage",
    "document.manage",
    "doctor.view",
    "service.view",
  ],
  LAB_TECHNICIAN: [
    "dashboard.view",
    "patient.view",
    "laboratory.view",
    "laboratory.manage",
    "document.view",
    "document.manage",
    "service.view",
  ],
  PHARMACIST: [
    "dashboard.view",
    "patient.view",
    "consultation.viewClinical",
    "encounter.view",
    "inventory.view",
    "inventory.manage",
    "service.view",
  ],
  FINANCE: [
    "dashboard.view",
    "finance.view",
    "finance.manage",
    "healthplan.view",
    "healthplan.manage",
    "service.view",
    "service.manage",
    "report.view",
    "insights.view",
    "patient.view",
    "doctor.view",
  ],
  INVENTORY_MANAGER: [
    "dashboard.view",
    "inventory.view",
    "inventory.manage",
    "supplier.view",
    "supplier.manage",
    "report.view",
  ],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Permissions granted to a role, as a stable sorted list (for UI + audit). */
export function permissionsOf(role: UserRole): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])].sort();
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  CLINIC_ADMIN: "Administrador",
  CLINIC_MANAGER: "Gestor da Clínica",
  RECEPTIONIST: "Rececionista",
  DOCTOR: "Médico",
  NURSE: "Enfermeiro",
  LAB_TECHNICIAN: "Técnico de Laboratório",
  PHARMACIST: "Farmacêutico",
  FINANCE: "Financeiro",
  INVENTORY_MANAGER: "Gestor de Stock",
};

/** Roles that carry global administrative privileges over the tenant. */
export const ADMINISTRATIVE_ROLES: UserRole[] = ["SUPER_ADMIN", "CLINIC_ADMIN"];
