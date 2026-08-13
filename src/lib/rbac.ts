import type { UserRole } from "@prisma/client";

// Permission catalog. Built-in roles map to sets of these keys. The Role table
// in the schema lets tenants define custom roles over the same catalog later.
export const PERMISSIONS = {
  "dashboard.view": "Ver painel executivo",
  "appointment.view": "Ver marcações",
  "appointment.manage": "Criar / remarcar / cancelar marcações",
  "appointment.checkin": "Check-in de pacientes",
  "patient.view": "Ver pacientes",
  "patient.manage": "Criar / editar pacientes",
  "consultation.conduct": "Iniciar e concluir consultas",
  "consultation.viewClinical": "Ver notas clínicas",
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
  "settings.manage": "Gerir configurações da clínica",
  "user.manage": "Gerir utilizadores e permissões",
} as const;

export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ALL,
  CLINIC_ADMIN: ALL,
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
  ],
  DOCTOR: [
    "dashboard.view",
    "appointment.view",
    "patient.view",
    "consultation.conduct",
    "consultation.viewClinical",
    "doctor.view",
    "doctor.stats",
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

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  CLINIC_ADMIN: "Administrador",
  RECEPTIONIST: "Rececionista",
  DOCTOR: "Médico",
  FINANCE: "Financeiro",
  INVENTORY_MANAGER: "Gestor de Stock",
};
