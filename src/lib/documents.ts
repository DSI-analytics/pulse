import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Armazenamento de documentos clínicos.
 *
 * Regras de segurança:
 *  - o ficheiro vive FORA de /public — nunca é servido por URL estática;
 *  - o tipo é determinado pelos bytes iniciais (magic numbers), não pela
 *    extensão nem pelo `Content-Type` declarado pelo cliente;
 *  - o nome do ficheiro em disco é gerado pelo servidor (nunca o do cliente),
 *    o que elimina path traversal e sobre-escrita;
 *  - a entrega faz-se por /api/documentos/[id], que revalida sessão,
 *    permissão e clínica.
 */

export const MAX_UPLOAD_BYTES = Number(process.env.PULSO_MAX_UPLOAD_MB ?? 15) * 1024 * 1024;

export interface AllowedType {
  mime: string;
  extension: string;
  label: string;
  /** Assinaturas possíveis: pares (offset, bytes). */
  signatures: { offset: number; bytes: number[] }[];
}

const ASCII = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

export const ALLOWED_TYPES: AllowedType[] = [
  { mime: "application/pdf", extension: "pdf", label: "PDF", signatures: [{ offset: 0, bytes: ASCII("%PDF-") }] },
  { mime: "image/jpeg", extension: "jpg", label: "JPEG", signatures: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] },
  { mime: "image/png", extension: "png", label: "PNG", signatures: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }] },
  {
    mime: "image/tiff",
    extension: "tiff",
    label: "TIFF",
    signatures: [
      { offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
      { offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
    ],
  },
  { mime: "application/dicom", extension: "dcm", label: "DICOM", signatures: [{ offset: 128, bytes: ASCII("DICM") }] },
];

export const ALLOWED_MIME_LIST = ALLOWED_TYPES.map((t) => t.mime);

function matches(bytes: Uint8Array, signature: { offset: number; bytes: number[] }): boolean {
  if (bytes.length < signature.offset + signature.bytes.length) return false;
  return signature.bytes.every((b, i) => bytes[signature.offset + i] === b);
}

/** Tipo real do ficheiro, deduzido dos bytes. `null` = não permitido. */
export function sniffMime(bytes: Uint8Array): AllowedType | null {
  for (const type of ALLOWED_TYPES) {
    if (type.signatures.some((sig) => matches(bytes, sig))) return type;
  }
  return null;
}

/** Diretório-raiz de armazenamento. Fora de /public por construção. */
export function uploadRoot(): string {
  const configured = process.env.PULSO_UPLOAD_DIR?.trim();
  return configured ? path.resolve(configured) : path.resolve(process.cwd(), "var", "uploads");
}

function resolveStoragePath(storageKey: string): string {
  const root = uploadRoot();
  const target = path.resolve(root, storageKey);
  // Defesa em profundidade: mesmo com uma chave adulterada na base de dados, o
  // caminho final tem de continuar dentro da raiz.
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Caminho de armazenamento inválido.");
  }
  return target;
}

export interface StoredFile {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  safeName: string;
}

export interface UploadValidationError {
  error: string;
}

/** Nome apresentável, sem separadores de caminho nem caracteres de controlo. */
export function sanitiseFilename(name: string, fallbackExtension: string): string {
  const RESERVED = new Set(['<', '>', ':', '"', '/', String.fromCharCode(92), '|', '?', '*']);
  const base = path
    .basename(name.split(String.fromCharCode(92)).join('/'))
    .split("")
    .filter((ch) => ch.charCodeAt(0) > 31 && !RESERVED.has(ch))
    .join("")
    .trim()
    .slice(0, 120);
  if (!base) return `documento.${fallbackExtension}`;
  return base.includes(".") ? base : `${base}.${fallbackExtension}`;
}

/**
 * Valida e grava o ficheiro. Devolve `{ error }` em vez de lançar para que o
 * chamador possa responder ao utilizador.
 */
export async function storeUpload(
  clinicId: string,
  file: File,
): Promise<StoredFile | UploadValidationError> {
  if (!file || typeof file.arrayBuffer !== "function") return { error: "Ficheiro em falta." };
  if (file.size <= 0) return { error: "Ficheiro vazio." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `Ficheiro demasiado grande (máx. ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).` };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { error: "Ficheiro demasiado grande." };

  const detected = sniffMime(bytes);
  if (!detected) {
    return {
      error: `Tipo de ficheiro não permitido. Aceites: ${ALLOWED_TYPES.map((t) => t.label).join(", ")}.`,
    };
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  const now = new Date();
  const folder = path.join(clinicId, String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"));
  const storageKey = path.join(folder, `${randomUUID()}.${detected.extension}`).replace(/\\/g, "/");
  const target = resolveStoragePath(storageKey);

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });

  return {
    storageKey,
    mimeType: detected.mime,
    sizeBytes: bytes.byteLength,
    checksum,
    safeName: sanitiseFilename(file.name ?? "", detected.extension),
  };
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  return readFile(resolveStoragePath(storageKey));
}

/** Remoção física — reservada a falhas de gravação e a limpezas administrativas. */
export async function removeStoredFile(storageKey: string): Promise<void> {
  try {
    await unlink(resolveStoragePath(storageKey));
  } catch {
    // Ausência do ficheiro não deve quebrar a operação de limpeza.
  }
}
