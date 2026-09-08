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
import type { Permission } from "./rbac";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  group: "Operação" | "Gestão" | "Sistema";
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, permission: "dashboard.view", group: "Operação" },
  { label: "Agenda", href: "/agenda", icon: CalendarDays, permission: "appointment.view", group: "Operação" },
  { label: "Pacientes", href: "/pacientes", icon: Users, permission: "patient.view", group: "Operação" },
  { label: "Consultas", href: "/consultas", icon: Stethoscope, permission: "appointment.view", group: "Operação" },
  { label: "Médicos", href: "/medicos", icon: BriefcaseMedical, permission: "doctor.view", group: "Gestão" },
  { label: "Planos de Saúde", href: "/planos", icon: ShieldCheck, permission: "healthplan.view", group: "Gestão" },
  { label: "Serviços e Exames", href: "/servicos", icon: FlaskConical, permission: "service.view", group: "Gestão" },
  { label: "Financeiro", href: "/financeiro", icon: Wallet, permission: "finance.view", group: "Gestão" },
  { label: "Stock", href: "/stock", icon: Package, permission: "inventory.view", group: "Gestão" },
  { label: "Fornecedores", href: "/fornecedores", icon: Truck, permission: "supplier.view", group: "Gestão" },
  { label: "Relatórios", href: "/relatorios", icon: BarChart3, permission: "report.view", group: "Gestão" },
  { label: "Insights", href: "/insights", icon: Sparkles, permission: "insights.view", group: "Gestão" },
  { label: "Auditoria", href: "/auditoria", icon: ScrollText, permission: "audit.view", group: "Sistema" },
  { label: "Configurações", href: "/configuracoes", icon: Settings, permission: "settings.manage", group: "Sistema" },
];
