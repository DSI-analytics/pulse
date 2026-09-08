// Sinais vitais: cálculos e classificação. Puro e testável — sem I/O.
//
// Os intervalos aqui são referências operacionais para *sinalizar* leituras
// fora do habitual num adulto. Não constituem diagnóstico nem substituem a
// avaliação do profissional.

export interface VitalsInput {
  systolic?: number | null;
  diastolic?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  temperature?: number | null;
  oxygenSaturation?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  glucose?: number | null;
  painScore?: number | null;
}

/** IMC = peso(kg) / altura(m)². Devolve null quando faltam dados plausíveis. */
export function computeBmi(weightKg?: number | null, heightCm?: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  if (weightKg <= 0 || weightKg > 500) return null;
  if (heightCm <= 30 || heightCm > 260) return null;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
}

export type BmiBand = "BAIXO_PESO" | "NORMAL" | "EXCESSO_PESO" | "OBESIDADE";

export function bmiBand(bmi: number | null): BmiBand | null {
  if (bmi === null) return null;
  if (bmi < 18.5) return "BAIXO_PESO";
  if (bmi < 25) return "NORMAL";
  if (bmi < 30) return "EXCESSO_PESO";
  return "OBESIDADE";
}

export const BMI_BAND_LABEL: Record<BmiBand, string> = {
  BAIXO_PESO: "Baixo peso",
  NORMAL: "Normal",
  EXCESSO_PESO: "Excesso de peso",
  OBESIDADE: "Obesidade",
};

/** Limites aceites na entrada de dados — rejeitam gralhas grosseiras. */
export const VITAL_LIMITS = {
  systolic: [40, 300],
  diastolic: [20, 200],
  heartRate: [20, 260],
  respiratoryRate: [4, 80],
  temperature: [25, 45],
  oxygenSaturation: [40, 100],
  weightKg: [0.3, 500],
  heightCm: [20, 260],
  glucose: [10, 900],
  painScore: [0, 10],
} as const satisfies Record<keyof VitalsInput, readonly [number, number]>;

export type VitalKey = keyof typeof VITAL_LIMITS;

/** Intervalos de referência do adulto usados para assinalar valores fora da norma. */
const NORMAL_RANGE: Partial<Record<VitalKey, readonly [number, number]>> = {
  systolic: [90, 139],
  diastolic: [60, 89],
  heartRate: [50, 100],
  respiratoryRate: [12, 20],
  temperature: [35.5, 37.5],
  oxygenSaturation: [95, 100],
  glucose: [70, 140],
};

export interface VitalFlag {
  key: VitalKey;
  value: number;
  direction: "ALTO" | "BAIXO";
  severity: "AVISO" | "CRITICO";
}

const CRITICAL_RANGE: Partial<Record<VitalKey, readonly [number, number]>> = {
  systolic: [80, 179],
  diastolic: [50, 109],
  heartRate: [40, 130],
  respiratoryRate: [8, 30],
  temperature: [34.9, 39.4],
  oxygenSaturation: [90, 100],
  glucose: [55, 250],
};

/** Sinaliza os parâmetros fora do intervalo de referência. */
export function flagVitals(input: VitalsInput): VitalFlag[] {
  const flags: VitalFlag[] = [];
  for (const [key, range] of Object.entries(NORMAL_RANGE) as [VitalKey, readonly [number, number]][]) {
    const value = input[key];
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    if (value >= range[0] && value <= range[1]) continue;
    const critical = CRITICAL_RANGE[key];
    const isCritical = critical ? value < critical[0] || value > critical[1] : false;
    flags.push({
      key,
      value,
      direction: value < range[0] ? "BAIXO" : "ALTO",
      severity: isCritical ? "CRITICO" : "AVISO",
    });
  }
  return flags;
}

export const VITAL_LABEL: Record<VitalKey, string> = {
  systolic: "Pressão sistólica",
  diastolic: "Pressão diastólica",
  heartRate: "Frequência cardíaca",
  respiratoryRate: "Frequência respiratória",
  temperature: "Temperatura",
  oxygenSaturation: "Saturação de oxigénio",
  weightKg: "Peso",
  heightCm: "Altura",
  glucose: "Glicemia",
  painScore: "Dor",
};

export const VITAL_UNIT: Record<VitalKey, string> = {
  systolic: "mmHg",
  diastolic: "mmHg",
  heartRate: "bpm",
  respiratoryRate: "cpm",
  temperature: "°C",
  oxygenSaturation: "%",
  weightKg: "kg",
  heightCm: "cm",
  glucose: "mg/dL",
  painScore: "/10",
};

/**
 * Valida e normaliza um valor introduzido. Devolve `null` para vazio e lança
 * quando está fora dos limites fisicamente plausíveis.
 */
export function parseVital(key: VitalKey, raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(value)) throw new Error(`${VITAL_LABEL[key]}: valor inválido.`);
  const [min, max] = VITAL_LIMITS[key];
  if (value < min || value > max) {
    throw new Error(`${VITAL_LABEL[key]}: valor fora dos limites aceites (${min}–${max} ${VITAL_UNIT[key]}).`);
  }
  return Math.round(value * 100) / 100;
}
