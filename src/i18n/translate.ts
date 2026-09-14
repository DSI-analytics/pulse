import type { MessageKey, Messages, MessageValues } from "./types";

/** Função de tradução: t("settings.title"), t("x.y", { count: 3 }). */
export type Translator = (key: MessageKey, values?: MessageValues) => string;

/**
 * Cria um tradutor sobre um dicionário. Funciona no servidor e no cliente.
 * Uma chave inexistente devolve a própria chave (visível, mas não parte a
 * página) — o `tsc` já impede isso em código tipado.
 */
export function createTranslator(messages: Messages): Translator {
  return (key, values) => {
    let node: unknown = messages;
    for (const part of key.split(".")) {
      node = node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
    }
    if (typeof node !== "string") return key;
    if (!values) return node;
    return node.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}
