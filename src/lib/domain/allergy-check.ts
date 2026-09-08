// Verificação estruturada entre prescrições e alergias registadas.
//
// IMPORTANTE — âmbito deliberadamente limitado:
//   * compara APENAS dados estruturados já existentes no prontuário
//     (substância da alergia vs. medicamento / princípio activo prescrito);
//   * NÃO infere interacções medicamentosas, NÃO consulta bases externas e
//     NÃO usa IA generativa para produzir informação farmacológica;
//   * a ausência de alerta nunca significa "seguro" — significa apenas que
//     não há correspondência nos dados estruturados disponíveis.
//
// Para verificação farmacológica real, o adaptador de integração deve ligar-se
// a uma base validada (ver src/lib/integrations).

/** minúsculas, sem acentos, sem pontuação e sem espaços redundantes. */
export function normaliseSubstance(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface AllergyRecord {
  id: string;
  substance: string;
  substanceKey: string;
  severity: "LEVE" | "MODERADA" | "GRAVE" | "FATAL";
  kind: "ALERGIA" | "INTOLERANCIA";
  reaction?: string | null;
}

export interface MedicationCandidate {
  medicationName: string;
  activeIngredient?: string | null;
}

export interface AllergyWarning {
  allergyId: string;
  substance: string;
  severity: AllergyRecord["severity"];
  kind: AllergyRecord["kind"];
  matchedOn: "medicamento" | "principio_activo";
  confidence: "exacta" | "parcial";
  message: string;
}

function tokens(value: string): string[] {
  return normaliseSubstance(value).split(" ").filter((t) => t.length >= 4);
}

function match(allergyKey: string, candidate: string): "exacta" | "parcial" | null {
  const target = normaliseSubstance(candidate);
  if (!allergyKey || !target) return null;
  if (target === allergyKey) return "exacta";
  if (target.includes(allergyKey) || allergyKey.includes(target)) return "parcial";
  const allergyTokens = new Set(tokens(allergyKey));
  if (tokens(target).some((t) => allergyTokens.has(t))) return "parcial";
  return null;
}

/**
 * Devolve os avisos que devem ser mostrados ao prescritor antes de emitir.
 * Só considera alergias com estado activo (filtragem é da responsabilidade do
 * chamador, que consulta apenas `status: "ACTIVA"`).
 */
export function checkAllergyConflicts(
  medication: MedicationCandidate,
  allergies: AllergyRecord[],
): AllergyWarning[] {
  const warnings: AllergyWarning[] = [];
  for (const allergy of allergies) {
    const key = allergy.substanceKey || normaliseSubstance(allergy.substance);

    const byName = match(key, medication.medicationName);
    const byIngredient = medication.activeIngredient ? match(key, medication.activeIngredient) : null;
    const confidence = byIngredient ?? byName;
    if (!confidence) continue;

    const matchedOn = byIngredient ? "principio_activo" : "medicamento";
    warnings.push({
      allergyId: allergy.id,
      substance: allergy.substance,
      severity: allergy.severity,
      kind: allergy.kind,
      matchedOn,
      confidence,
      message:
        `${allergy.kind === "ALERGIA" ? "Alergia" : "Intolerância"} registada a “${allergy.substance}”` +
        ` (${allergy.severity.toLowerCase()})` +
        `${allergy.reaction ? ` — reacção: ${allergy.reaction}` : ""}.` +
        ` Correspondência ${confidence} pelo ${matchedOn === "principio_activo" ? "princípio activo" : "nome do medicamento"}.`,
    });
  }

  const rank = { FATAL: 0, GRAVE: 1, MODERADA: 2, LEVE: 3 } as const;
  return warnings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Verdadeiro quando existe pelo menos um aviso que exige confirmação explícita. */
export function requiresOverride(warnings: AllergyWarning[]): boolean {
  return warnings.some((w) => w.severity === "GRAVE" || w.severity === "FATAL");
}
