import type { AppointmentStatus, AppointmentType } from "@prisma/client";
import type { BadgeProps } from "@/components/ui/badge";

type Variant = NonNullable<BadgeProps["variant"]>;

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  MARCADA: "Marcada",
  CONFIRMADA: "Confirmada",
  CHEGOU: "Chegou",
  EM_ESPERA: "Em Espera",
  EM_CONSULTA: "Em Consulta",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
  NAO_COMPARECEU: "Não Compareceu",
};

export const STATUS_VARIANT: Record<AppointmentStatus, Variant> = {
  MARCADA: "neutral",
  CONFIRMADA: "info",
  CHEGOU: "warning",
  EM_ESPERA: "warning",
  EM_CONSULTA: "default",
  CONCLUIDA: "success",
  CANCELADA: "outline",
  NAO_COMPARECEU: "danger",
};

// Colour used for calendar/agenda blocks (hex, so it works in inline styles).
export const STATUS_COLOR: Record<AppointmentStatus, string> = {
  MARCADA: "#5c716b",
  CONFIRMADA: "#2563a8",
  CHEGOU: "#b26a06",
  EM_ESPERA: "#b26a06",
  EM_CONSULTA: "#0c7c74",
  CONCLUIDA: "#1f9d57",
  CANCELADA: "#9aa8a3",
  NAO_COMPARECEU: "#cb4133",
};

export const STATUS_ORDER: AppointmentStatus[] = [
  "MARCADA",
  "CONFIRMADA",
  "CHEGOU",
  "EM_ESPERA",
  "EM_CONSULTA",
  "CONCLUIDA",
  "NAO_COMPARECEU",
  "CANCELADA",
];

export const TYPE_LABEL: Record<AppointmentType, string> = {
  CONSULTA: "Consulta",
  RETORNO: "Retorno",
  EXAME: "Exame",
  PROCEDIMENTO: "Procedimento",
};
