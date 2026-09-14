import {
  Building2,
  CalendarClock,
  Languages,
  Palette,
  PlugZap,
  Stethoscope,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/rbac";

export type SettingsSectionId =
  | "appearance"
  | "account"
  | "clinic"
  | "regional"
  | "users"
  | "schedule"
  | "specialties"
  | "integrations";

export interface SettingsSection {
  id: SettingsSectionId;
  href: string;
  icon: LucideIcon;
  group: "personal" | "clinic";
  /** `null` = disponível para qualquer pessoa com sessão. */
  permission: Permission | null;
}

/**
 * Secções das Configurações. A permissão aqui só decide que botões aparecem;
 * cada página e cada acção voltam a verificá-la no servidor.
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "appearance", href: "/configuracoes/aparencia", icon: Palette, group: "personal", permission: null },
  { id: "account", href: "/minha-conta", icon: UserRound, group: "personal", permission: null },
  { id: "clinic", href: "/configuracoes/clinica", icon: Building2, group: "clinic", permission: "settings.manage" },
  { id: "regional", href: "/configuracoes/moeda-e-idioma", icon: Languages, group: "clinic", permission: "settings.manage" },
  { id: "users", href: "/configuracoes/utilizadores", icon: Users, group: "clinic", permission: "user.manage" },
  { id: "schedule", href: "/configuracoes/agenda-e-alertas", icon: CalendarClock, group: "clinic", permission: "settings.manage" },
  { id: "specialties", href: "/configuracoes/especialidades", icon: Stethoscope, group: "clinic", permission: "doctor.manage" },
  { id: "integrations", href: "/configuracoes/integracoes", icon: PlugZap, group: "clinic", permission: "settings.manage" },
];
