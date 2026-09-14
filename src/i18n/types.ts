/**
 * Tipos do sistema de traduções.
 *
 * O dicionário português (`messages/pt.ts`) é a fonte: o inglês é tipado como
 * `Messages`, por isso o `tsc` falha se faltar (ou sobrar) alguma chave.
 */
import type pt from "./messages/pt";

/** Converte as strings literais de `pt` em `string`, mantendo a forma. */
type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof pt>;

/** Chaves "a.b.c" de todas as folhas do dicionário. */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;

/** Valores para interpolação: "Olá, {name}" + { name: "Ana" }. */
export type MessageValues = Record<string, string | number>;
