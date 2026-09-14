import type { Translator } from "@/i18n/translate";
import type { MessageKey } from "@/i18n/types";

/**
 * Rótulo curto, em minúsculas, de um valor de enum clínico (badges da linha
 * temporal, tipo/certeza de diagnóstico, resumos). Serve servidor e cliente.
 * Um valor sem tradução cai no formato antigo ("EM_CURSO" → "em curso").
 */
export function clinicalEnumLabel(t: Translator, value: string): string {
  const key = `clinical.enums.${value.replace(/ /g, "_")}` as MessageKey;
  const label = t(key);
  return label === key ? value.replace(/_/g, " ").toLowerCase() : label;
}
