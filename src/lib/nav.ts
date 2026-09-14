import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Stethoscope,
  BriefcaseMedical,
  ShieldCheck,
  FlaskConical,
  Wallet,
  Package,
  Truck,
  BarChart3,
  Sparkles,
  Settings,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/i18n/types";
import type { Permission } from "./rbac";

export const NAV_GROUPS = ["operation", "management", "system"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavItem {
  /** Chave de tradução do rótulo (ex.: "nav.patients"). */
  labelKey: MessageKey;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  /** Grupo; o título traduz-se com `nav.groups.<group>`. */
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav.dashboard", href: "/", icon: LayoutDashboard, permission: "dashboard.view", group: "operation" },
  { labelKey: "nav.agenda", href: "/agenda", icon: CalendarDays, permission: "appointment.view", group: "operation" },
  { labelKey: "nav.patients", href: "/pacientes", icon: Users, permission: "patient.view", group: "operation" },
  { labelKey: "nav.consultations", href: "/consultas", icon: Stethoscope, permission: "appointment.view", group: "operation" },
  { labelKey: "nav.doctors", href: "/medicos", icon: BriefcaseMedical, permission: "doctor.view", group: "management" },
  { labelKey: "nav.healthPlans", href: "/planos", icon: ShieldCheck, permission: "healthplan.view", group: "management" },
  { labelKey: "nav.services", href: "/servicos", icon: FlaskConical, permission: "service.view", group: "management" },
  { labelKey: "nav.finance", href: "/financeiro", icon: Wallet, permission: "finance.view", group: "management" },
  { labelKey: "nav.stock", href: "/stock", icon: Package, permission: "inventory.view", group: "management" },
  { labelKey: "nav.suppliers", href: "/fornecedores", icon: Truck, permission: "supplier.view", group: "management" },
  { labelKey: "nav.reports", href: "/relatorios", icon: BarChart3, permission: "report.view", group: "management" },
  { labelKey: "nav.insights", href: "/insights", icon: Sparkles, permission: "insights.view", group: "management" },
  { labelKey: "nav.audit", href: "/auditoria", icon: ScrollText, permission: "audit.view", group: "system" },
  // Visível para todos (todos os perfis têm dashboard.view): cada pessoa pode
  // ajustar a sua Aparência; as áreas da clínica verificam a sua permissão.
  { labelKey: "nav.settings", href: "/configuracoes", icon: Settings, permission: "dashboard.view", group: "system" },
];
