/**
 * Auxiliares puros da CID-11 (ICD-11) da OMS.
 *
 * Aqui não há acesso à rede nem à base de dados: apenas o tratamento do texto
 * devolvido pela API da OMS e a validação da forma de um código. O catálogo em
 * si NUNCA é definido neste ficheiro — vem sempre da API da OMS (ou da
 * instalação local da OMS) e fica em cache na tabela `IcdCode`.
 */

/**
 * Forma de um código da linearização MMS: 2 a 6 caracteres alfanuméricos e,
 * opcionalmente, um sufixo após o ponto (ex.: `1A00`, `XN109`, `8B60.1`).
 * Blocos e capítulos (`BlockL1-1A0`, `01`) não são códigos atribuíveis.
 */
const CODE_SHAPE = /^[0-9A-Z][0-9A-Z]{1,5}(\.[0-9A-Z]{1,4})?$/;

/** Marcação de realce devolvida pela pesquisa da OMS: `<em class='found'>…</em>`. */
const TAG = /<[^>]*>/g;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Remove a marcação de realce (e qualquer outra) do título devolvido pela
 * pesquisa da OMS, devolvendo texto simples pronto a guardar e a mostrar.
 */
export function stripHighlight(value: string): string {
  return String(value ?? "")
    .replace(TAG, "")
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza texto para pesquisa local: minúsculas, sem acentos e com espaços
 * colapsados. É o valor guardado em `IcdCode.searchText`.
 */
export function normaliseSearchText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Forma canónica de um código: sem espaços e em maiúsculas. */
export function normaliseIcdCode(value: string): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Valida a FORMA do código — não confirma que existe no catálogo da OMS. */
export function isValidIcdCode(value: string): boolean {
  const code = normaliseIcdCode(value);
  if (code.length < 2 || code.length > 12) return false;
  return CODE_SHAPE.test(code);
}

/**
 * Resumo desnormalizado dos diagnósticos de uma consulta
 * (`"1A00 — Cólera; 5A11 — Diabetes tipo 2"`). Guardado em
 * `Consultation.diagnosis` enquanto a consulta está aberta, apenas para
 * leitura rápida — a fonte de verdade são as linhas `Diagnosis`.
 */
export function formatDiagnosisSummary(entries: { code: string; title: string }[]): string {
  return entries
    .map((entry) => {
      const code = normaliseIcdCode(entry.code);
      const title = stripHighlight(entry.title);
      if (!code) return title;
      return title ? `${code} — ${title}` : code;
    })
    .filter(Boolean)
    .join("; ");
}
